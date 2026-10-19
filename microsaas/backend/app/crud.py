"""Fábrica de routers CRUD multi-tenant.

Genera los esquemas Pydantic a partir de las columnas del modelo y aplica:
aislamiento por tenant, validación de llaves foráneas del mismo tenant,
límites del plan, búsqueda, filtros, importación y exportación CSV.
"""

import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import ValidationError, create_model
from sqlalchemy import String, Text, func, inspect, or_, select

from .deps import Ctx, require_product

AUTO_FIELDS = {"id", "tenant_id", "created_at", "updated_at"}


def model_columns(model) -> dict:
    return {c.key: c for c in inspect(model).columns}


def _py_type(col) -> Any:
    try:
        return col.type.python_type
    except NotImplementedError:
        return Any


def build_schema(model, name: str, exclude: set[str], partial: bool):
    fields = {}
    for key, col in model_columns(model).items():
        if key in AUTO_FIELDS or key in exclude:
            continue
        t = _py_type(col)
        optional = partial or col.nullable or col.default is not None or col.server_default is not None
        fields[key] = (Optional[t], None) if optional else (t, ...)
    return create_model(name, **fields)


def to_dict(obj, extra: dict | None = None) -> dict:
    data = {c.key: getattr(obj, c.key) for c in inspect(obj.__class__).columns}
    if extra:
        data.update(extra)
    return jsonable_encoder(data)


def _coerce_csv(value: str, col) -> Any:
    value = (value or "").strip()
    if value == "":
        return None
    t = _py_type(col)
    try:
        if t is bool:
            return value.lower() in ("1", "true", "si", "sí", "yes", "x")
        if t is int:
            return int(float(value))
        if t is Decimal:
            return Decimal(value.replace(",", ""))
        if t is date:
            return date.fromisoformat(value[:10])
        if t is datetime:
            return datetime.fromisoformat(value)
    except (ValueError, InvalidOperation) as e:
        raise ValueError(f"Valor inválido '{value}' para {col.key}") from e
    return value


def tenant_fk_check(ctx: Ctx, model, data: dict) -> None:
    """Verifica que toda llave foránea apunte a un registro del mismo tenant."""
    for key, col in model_columns(model).items():
        if key == "tenant_id" or key not in data or data[key] is None:
            continue
        for fk in col.foreign_keys:
            target = fk.column.table
            if "tenant_id" not in target.c:
                continue
            row = ctx.db.execute(
                select(target.c.id).where(target.c.id == data[key], target.c.tenant_id == ctx.tenant_id)
            ).first()
            if not row:
                raise HTTPException(400, f"Referencia inválida en {key}")


def crud_router(
    model,
    product: str,
    prefix: str,
    *,
    limit_key: str | None = None,
    limit_count: Callable[[Ctx], int] | None = None,
    search: tuple[str, ...] = (),
    filters: tuple[str, ...] = (),
    order_by: Any = None,
    readonly: set[str] | None = None,
    before_save: Callable[[Ctx, Any, dict, bool], None] | None = None,
    after_save: Callable[[Ctx, Any, bool], None] | None = None,
    serialize: Callable[[Ctx, Any], dict] | None = None,
    csv_import: bool = False,
    admin_only_write: bool = False,
) -> APIRouter:
    readonly = readonly or set()
    tag = f"{product}:{prefix.strip('/')}"
    CreateSchema = build_schema(model, f"{model.__name__}Create", readonly, partial=False)
    UpdateSchema = build_schema(model, f"{model.__name__}Update", readonly, partial=True)
    cols = model_columns(model)
    router = APIRouter(prefix=prefix, tags=[tag])
    dep = require_product(product)
    ser = serialize or (lambda ctx, o: to_dict(o))

    def _base(ctx: Ctx):
        return select(model).where(model.tenant_id == ctx.tenant_id)

    def _count(ctx: Ctx) -> int:
        if limit_count:
            return limit_count(ctx)
        return ctx.db.scalar(select(func.count()).select_from(model).where(model.tenant_id == ctx.tenant_id)) or 0

    def _get(ctx: Ctx, item_id: int):
        obj = ctx.db.scalar(_base(ctx).where(model.id == item_id))
        if not obj:
            raise HTTPException(404, "No encontrado")
        return obj

    def _check_write(ctx: Ctx):
        if admin_only_write and ctx.user.role not in ("owner", "admin"):
            raise HTTPException(403, "Requiere rol administrador")

    def _create(ctx: Ctx, data: dict):
        _check_write(ctx)
        if limit_key:
            ctx.check_limit(limit_key, _count(ctx))
        tenant_fk_check(ctx, model, data)
        obj = model(tenant_id=ctx.tenant_id)
        if before_save:
            before_save(ctx, obj, data, True)
        for k, v in data.items():
            setattr(obj, k, v)
        ctx.db.add(obj)
        ctx.db.flush()
        if after_save:
            after_save(ctx, obj, True)
        return obj

    @router.get("")
    def list_items(
        request: Request,
        q: str | None = None,
        limit: int = Query(200, le=1000),
        offset: int = 0,
        ctx: Ctx = Depends(dep),
    ):
        stmt = _base(ctx)
        if q and search:
            like = f"%{q.lower()}%"
            stmt = stmt.where(or_(*[func.lower(getattr(model, f)).like(like) for f in search]))
        for f in filters:
            val = request.query_params.get(f)
            if val not in (None, ""):
                col = cols[f]
                stmt = stmt.where(getattr(model, f) == _coerce_csv(val, col))
        total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery()))
        stmt = stmt.order_by(order_by if order_by is not None else model.id.desc()).limit(limit).offset(offset)
        items = ctx.db.scalars(stmt).all()
        return {"items": [ser(ctx, o) for o in items], "total": total}

    @router.get("/export")
    def export_csv(ctx: Ctx = Depends(dep)):
        items = ctx.db.scalars(_base(ctx).order_by(model.id)).all()
        buf = io.StringIO()
        keys = [k for k in cols if k != "tenant_id"]
        w = csv.writer(buf)
        w.writerow(keys)
        for o in items:
            d = to_dict(o)
            w.writerow([d.get(k, "") if d.get(k) is not None else "" for k in keys])
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{prefix.strip("/")}.csv"'},
        )

    @router.get("/{item_id}")
    def get_item(item_id: int, ctx: Ctx = Depends(dep)):
        return ser(ctx, _get(ctx, item_id))

    @router.post("", status_code=201)
    def create_item(payload: CreateSchema, ctx: Ctx = Depends(dep)):  # type: ignore[valid-type]
        obj = _create(ctx, payload.model_dump(exclude_unset=True))
        ctx.db.commit()
        return ser(ctx, obj)

    @router.patch("/{item_id}")
    def update_item(item_id: int, payload: UpdateSchema, ctx: Ctx = Depends(dep)):  # type: ignore[valid-type]
        _check_write(ctx)
        obj = _get(ctx, item_id)
        data = payload.model_dump(exclude_unset=True)
        tenant_fk_check(ctx, model, data)
        if before_save:
            before_save(ctx, obj, data, False)
        for k, v in data.items():
            setattr(obj, k, v)
        ctx.db.flush()
        if after_save:
            after_save(ctx, obj, False)
        ctx.db.commit()
        return ser(ctx, obj)

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: int, ctx: Ctx = Depends(dep)):
        _check_write(ctx)
        ctx.db.delete(_get(ctx, item_id))
        ctx.db.commit()

    if csv_import:

        @router.post("/import")
        async def import_csv(file: UploadFile = File(...), ctx: Ctx = Depends(dep)):
            raw = (await file.read()).decode("utf-8-sig")
            sample = raw[:2048]
            delim = ";" if sample.count(";") > sample.count(",") else ","
            reader = csv.DictReader(io.StringIO(raw), delimiter=delim)
            created, errors = 0, []
            for i, row in enumerate(reader, start=2):
                try:
                    data = {}
                    for k, v in row.items():
                        key = (k or "").strip().lower()
                        if key in cols and key not in AUTO_FIELDS and key not in readonly:
                            val = _coerce_csv(v, cols[key])
                            if val is not None:
                                data[key] = val
                    data = CreateSchema(**data).model_dump(exclude_unset=True)
                    with ctx.db.begin_nested():
                        _create(ctx, data)
                    created += 1
                except HTTPException as e:
                    errors.append({"row": i, "error": e.detail})
                    if e.status_code == 402:
                        break
                except (ValidationError, ValueError) as e:
                    errors.append({"row": i, "error": str(e)[:300]})
            ctx.db.commit()
            return {"created": created, "errors": errors[:50]}

    return router


def text_columns(model) -> tuple[str, ...]:
    return tuple(k for k, c in model_columns(model).items() if isinstance(c.type, (String, Text)))
