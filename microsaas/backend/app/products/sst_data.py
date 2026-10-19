"""Estándares mínimos SG-SST - Resolución 0312 de 2019 (Colombia).

Tabla de 60 ítems con su peso porcentual (suma 100). Las tablas de 7 y 21 ítems
(art. 3 y art. 9) se califican por porcentaje de cumplimiento.
Verifique siempre contra el texto oficial vigente antes de usar en auditorías.
"""

STANDARD_60 = [
    # (código, ciclo, grupo, descripción, peso)
    ("1.1.1", "PLANEAR", "Recursos", "Responsable del Sistema de Gestión de Seguridad y Salud en el Trabajo", 0.5),
    ("1.1.2", "PLANEAR", "Recursos", "Responsabilidades en el SG-SST", 0.5),
    ("1.1.3", "PLANEAR", "Recursos", "Asignación de recursos para el SG-SST", 0.5),
    ("1.1.4", "PLANEAR", "Recursos", "Afiliación al Sistema General de Riesgos Laborales", 0.5),
    ("1.1.5", "PLANEAR", "Recursos", "Pago de pensión trabajadores de alto riesgo", 0.5),
    ("1.1.6", "PLANEAR", "Recursos", "Conformación COPASST", 0.5),
    ("1.1.7", "PLANEAR", "Recursos", "Capacitación COPASST", 0.5),
    ("1.1.8", "PLANEAR", "Recursos", "Conformación Comité de Convivencia", 0.5),
    ("1.2.1", "PLANEAR", "Recursos", "Programa de capacitación promoción y prevención (PyP)", 2),
    ("1.2.2", "PLANEAR", "Recursos", "Inducción y reinducción en SG-SST, actividades de PyP", 2),
    ("1.2.3", "PLANEAR", "Recursos", "Responsables del SG-SST con curso virtual de 50 horas", 2),
    ("2.1.1", "PLANEAR", "Gestión integral del SG-SST", "Política del SG-SST firmada, fechada y comunicada al COPASST", 1),
    ("2.2.1", "PLANEAR", "Gestión integral del SG-SST", "Objetivos definidos, claros, medibles, cuantificables, con metas, documentados, revisados", 1),
    ("2.3.1", "PLANEAR", "Gestión integral del SG-SST", "Evaluación e identificación de prioridades", 1),
    ("2.4.1", "PLANEAR", "Gestión integral del SG-SST", "Plan que identifica objetivos, metas, responsabilidad, recursos con cronograma y firmado", 2),
    ("2.5.1", "PLANEAR", "Gestión integral del SG-SST", "Archivo o retención documental del SG-SST", 2),
    ("2.6.1", "PLANEAR", "Gestión integral del SG-SST", "Rendición sobre el desempeño", 1),
    ("2.7.1", "PLANEAR", "Gestión integral del SG-SST", "Matriz legal", 2),
    ("2.8.1", "PLANEAR", "Gestión integral del SG-SST", "Mecanismos de comunicación, auto reporte en SG-SST", 1),
    ("2.9.1", "PLANEAR", "Gestión integral del SG-SST", "Identificación, evaluación para adquisición de productos y servicios en SG-SST", 1),
    ("2.10.1", "PLANEAR", "Gestión integral del SG-SST", "Evaluación y selección de proveedores y contratistas", 2),
    ("2.11.1", "PLANEAR", "Gestión integral del SG-SST", "Evaluación del impacto de cambios internos y externos en el SG-SST", 1),
    ("3.1.1", "HACER", "Gestión de la salud", "Evaluación médica ocupacional: descripción sociodemográfica y diagnóstico de condiciones de salud", 1),
    ("3.1.2", "HACER", "Gestión de la salud", "Actividades de promoción y prevención en salud", 1),
    ("3.1.3", "HACER", "Gestión de la salud", "Información al médico de los perfiles de cargo", 1),
    ("3.1.4", "HACER", "Gestión de la salud", "Realización de evaluaciones médicas ocupacionales: peligros, periodicidad, comunicación al trabajador", 1),
    ("3.1.5", "HACER", "Gestión de la salud", "Custodia de historias clínicas", 1),
    ("3.1.6", "HACER", "Gestión de la salud", "Restricciones y recomendaciones médico laborales", 1),
    ("3.1.7", "HACER", "Gestión de la salud", "Estilos de vida y entornos saludables (fármaco-dependencia, alcohol, tabaquismo)", 1),
    ("3.1.8", "HACER", "Gestión de la salud", "Agua potable, servicios sanitarios y disposición de basuras", 1),
    ("3.1.9", "HACER", "Gestión de la salud", "Eliminación adecuada de residuos sólidos, líquidos o gaseosos", 1),
    ("3.2.1", "HACER", "Gestión de la salud", "Reporte de los accidentes de trabajo y enfermedad laboral a la ARL, EPS y Dirección Territorial", 2),
    ("3.2.2", "HACER", "Gestión de la salud", "Investigación de incidentes, accidentes y enfermedades laborales", 2),
    ("3.2.3", "HACER", "Gestión de la salud", "Registro y análisis estadístico de accidentes y enfermedades laborales", 1),
    ("3.3.1", "HACER", "Gestión de la salud", "Medición de la frecuencia de la accidentalidad", 1),
    ("3.3.2", "HACER", "Gestión de la salud", "Medición de la severidad de la accidentalidad", 1),
    ("3.3.3", "HACER", "Gestión de la salud", "Medición de la mortalidad por accidentes de trabajo", 1),
    ("3.3.4", "HACER", "Gestión de la salud", "Medición de la prevalencia de enfermedad laboral", 1),
    ("3.3.5", "HACER", "Gestión de la salud", "Medición de la incidencia de enfermedad laboral", 1),
    ("3.3.6", "HACER", "Gestión de la salud", "Medición del ausentismo por causa médica", 1),
    ("4.1.1", "HACER", "Gestión de peligros y riesgos", "Metodología para la identificación de peligros, evaluación y valoración de riesgos", 4),
    ("4.1.2", "HACER", "Gestión de peligros y riesgos", "Identificación de peligros con participación de todos los niveles de la empresa", 4),
    ("4.1.3", "HACER", "Gestión de peligros y riesgos", "Identificación y priorización de la naturaleza de los peligros (agentes cancerígenos, etc.)", 3),
    ("4.1.4", "HACER", "Gestión de peligros y riesgos", "Realización de mediciones ambientales, químicos, físicos y biológicos", 4),
    ("4.2.1", "HACER", "Gestión de peligros y riesgos", "Se implementan las medidas de prevención y control de peligros", 2.5),
    ("4.2.2", "HACER", "Gestión de peligros y riesgos", "Se verifica aplicación de las medidas de prevención y control", 2.5),
    ("4.2.3", "HACER", "Gestión de peligros y riesgos", "Hay procedimientos, instructivos, fichas, protocolos", 2.5),
    ("4.2.4", "HACER", "Gestión de peligros y riesgos", "Inspección con el COPASST o Vigía", 2.5),
    ("4.2.5", "HACER", "Gestión de peligros y riesgos", "Mantenimiento periódico de instalaciones, equipos, máquinas, herramientas", 2.5),
    ("4.2.6", "HACER", "Gestión de peligros y riesgos", "Entrega de elementos de protección personal (EPP) y capacitación en su uso", 2.5),
    ("5.1.1", "HACER", "Gestión de amenazas", "Se cuenta con el Plan de Prevención y Preparación ante emergencias", 5),
    ("5.1.2", "HACER", "Gestión de amenazas", "Brigada de prevención conformada, capacitada y dotada", 5),
    ("6.1.1", "VERIFICAR", "Verificación del SG-SST", "Indicadores de estructura, proceso y resultado", 1.25),
    ("6.1.2", "VERIFICAR", "Verificación del SG-SST", "La empresa adelanta auditoría por lo menos una vez al año", 1.25),
    ("6.1.3", "VERIFICAR", "Verificación del SG-SST", "Revisión anual de la alta dirección, resultados y alcance de la auditoría", 1.25),
    ("6.1.4", "VERIFICAR", "Verificación del SG-SST", "Planificar auditorías con el COPASST", 1.25),
    ("7.1.1", "ACTUAR", "Mejoramiento", "Definir acciones de promoción y prevención con base en resultados del SG-SST", 2.5),
    ("7.1.2", "ACTUAR", "Mejoramiento", "Acciones de mejora conforme a revisión de la alta dirección", 2.5),
    ("7.1.3", "ACTUAR", "Mejoramiento", "Acciones de mejora con base en investigaciones de accidentes de trabajo y enfermedades laborales", 2.5),
    ("7.1.4", "ACTUAR", "Mejoramiento", "Elaboración plan de mejoramiento e implementación de medidas y acciones correctivas", 2.5),
]

STANDARD_21 = [
    ("21.1", "PLANEAR", "Recursos", "Asignación de persona que diseña el SG-SST"),
    ("21.2", "PLANEAR", "Recursos", "Asignación de recursos para el SG-SST"),
    ("21.3", "PLANEAR", "Recursos", "Afiliación al Sistema de Seguridad Social Integral"),
    ("21.4", "PLANEAR", "Recursos", "Conformación y funcionamiento del COPASST"),
    ("21.5", "PLANEAR", "Recursos", "Conformación y funcionamiento del Comité de Convivencia Laboral"),
    ("21.6", "PLANEAR", "Recursos", "Programa de capacitación"),
    ("21.7", "PLANEAR", "Gestión integral", "Política de Seguridad y Salud en el Trabajo"),
    ("21.8", "PLANEAR", "Gestión integral", "Plan anual de trabajo"),
    ("21.9", "PLANEAR", "Gestión integral", "Archivo o retención documental del SG-SST"),
    ("21.10", "HACER", "Gestión de la salud", "Descripción sociodemográfica y diagnóstico de condiciones de salud"),
    ("21.11", "HACER", "Gestión de la salud", "Actividades de medicina del trabajo y de prevención y promoción de la salud"),
    ("21.12", "HACER", "Gestión de la salud", "Evaluaciones médicas ocupacionales"),
    ("21.13", "HACER", "Gestión de la salud", "Restricciones y recomendaciones médico laborales"),
    ("21.14", "HACER", "Gestión de la salud", "Reporte de accidentes de trabajo y enfermedades laborales"),
    ("21.15", "HACER", "Gestión de la salud", "Investigación de incidentes, accidentes de trabajo y enfermedades laborales"),
    ("21.16", "HACER", "Gestión de peligros y riesgos", "Identificación de peligros, evaluación y valoración de riesgos"),
    ("21.17", "HACER", "Gestión de peligros y riesgos", "Medidas de prevención y control frente a peligros/riesgos identificados"),
    ("21.18", "HACER", "Gestión de peligros y riesgos", "Mantenimiento periódico de instalaciones, equipos, máquinas y herramientas"),
    ("21.19", "HACER", "Gestión de peligros y riesgos", "Entrega de elementos de protección personal (EPP) y capacitación en su uso"),
    ("21.20", "HACER", "Gestión de amenazas", "Plan de prevención, preparación y respuesta ante emergencias"),
    ("21.21", "HACER", "Gestión de amenazas", "Brigada de prevención, preparación y respuesta ante emergencias"),
]

STANDARD_7 = [
    ("7.1", "PLANEAR", "Recursos", "Asignación de persona que diseña el SG-SST"),
    ("7.2", "PLANEAR", "Recursos", "Afiliación al Sistema de Seguridad Social Integral"),
    ("7.3", "PLANEAR", "Recursos", "Capacitación en SST"),
    ("7.4", "PLANEAR", "Gestión integral", "Plan anual de trabajo"),
    ("7.5", "HACER", "Gestión de la salud", "Evaluaciones médicas ocupacionales"),
    ("7.6", "HACER", "Gestión de peligros y riesgos", "Identificación de peligros, evaluación y valoración de riesgos"),
    ("7.7", "HACER", "Gestión de peligros y riesgos", "Medidas de prevención y control frente a peligros/riesgos identificados"),
]


def items_for(standard: int) -> list[dict]:
    if standard == 60:
        return [{"code": c, "cycle": cy, "group": g, "text": t, "weight": w} for c, cy, g, t, w in STANDARD_60]
    src = STANDARD_21 if standard == 21 else STANDARD_7
    w = round(100 / len(src), 4)
    return [{"code": c, "cycle": cy, "group": g, "text": t, "weight": w} for c, cy, g, t in src]


def standard_for(workers: int, risk_level: int) -> int:
    if risk_level >= 4 or workers > 50:
        return 60
    if workers > 10:
        return 21
    return 7


def score(standard: int, answers: dict) -> tuple[float, str]:
    """`cumple` y `no_aplica` (justificado) suman el peso del ítem."""
    total = sum(i["weight"] for i in items_for(standard) if answers.get(i["code"]) in ("cumple", "no_aplica"))
    total = round(min(total, 100.0), 2)
    if total < 60:
        rating = "critico"
    elif total <= 85:
        rating = "moderadamente_aceptable"
    else:
        rating = "aceptable"
    return total, rating
