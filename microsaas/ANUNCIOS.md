# Plan de publicidad pagada

Los costos por clic y los presupuestos son **estimaciones**. Las plataformas muestran el valor real en cuanto empiezas.

## 0. Antes de gastar un peso: medir (30 min, una sola vez)
Sin medición no sabrás qué anuncio trae clientes y gastarás a ciegas.

1. **Google Analytics → Administrar → Eventos clave → Nuevo evento clave.** Crea `sign_up` y `purchase`, con el nombre exacto.
2. **Google Ads** (ads.google.com):
   - Crea la cuenta en **modo experto**. Si te pide crear una campaña, busca "Crear una cuenta sin campaña".
   - Moneda: **USD**. Zona horaria: **Bogotá**.
   - Vincula Analytics: **Herramientas → Cuentas vinculadas → Google Analytics (GA4) → Vincular**.
   - Importa las conversiones: **Objetivos → Conversiones → + Nueva → Importar → Google Analytics 4 → Web**. Marca `purchase` como **principal** y `sign_up` como **secundaria**.
3. **Meta** (business.facebook.com):
   - Ve a **Administrador de eventos → Conectar orígenes de datos → Web → Píxel**.
   - Copia el ID (solo números) y pégalo en **Superadmin → Integraciones → Píxeles de publicidad**.
   - Ve a **Configuración del negocio → Seguridad de la marca → Dominios → Agregar** `microsuiteapps.com` y verifícalo con el registro **TXT** en Namecheap, igual que hiciste con Google.
4. **LinkedIn**: solo si vas a pautar ahí (ver §4). Ve a **Campaign Manager → Analizar → Insight Tag → Partner ID** y pégalo en Integraciones.

## 1. Presupuesto inicial recomendado: ~US$10/día (~US$300/mes)
| Canal | App | US$/día | Por qué |
|---|---|---|---|
| Google Search | LicenciaLens | 5 | La gente busca activamente cómo ahorrar en Microsoft 365, y es tu plan más caro |
| Google Search | TributAlerta y DatosOK (solo Colombia) | 2 | Búsquedas con intención clara y clics baratos en Colombia |
| Meta (Facebook/Instagram) | TributAlerta, SST-0312 y DatosOK (Colombia) | 3 | Contadores, profesionales SG-SST y dueños de negocio son fáciles de segmentar |

**Reglas para no perder plata:**
- No toques nada los primeros **7 días**: los algoritmos están aprendiendo.
- Si un anuncio o palabra clave gasta **US$40 sin un solo registro**, pausa esa palabra o ese anuncio.
- Si una campaña consigue registros a **menos de US$15 cada uno**, súbele el presupuesto un 20% por semana.
- **Cuánto puedes pagar por cliente:** un cliente de LicenciaLens Pro paga US$59/mes. Aun pagando US$100 por conseguirlo, lo recuperas en 2 meses.

---

## 2. Google Ads: campañas de búsqueda
Configuración común:
- Tipo **Búsqueda**, solo red de búsqueda. **Desmarca** "Red de Display" y "Socios de búsqueda".
- Puja: empieza con **Maximizar clics** con límite de **US$1.50 por clic**. Cuando tengas 15 o más conversiones, cambia a **Maximizar conversiones**.
- Usa concordancia **de frase** (entre comillas) o **exacta** (entre corchetes). **Nunca** concordancia amplia al principio.

### Campaña A: LicenciaLens (español)
- **Ubicaciones:** Colombia, México, Perú, Chile, Ecuador, Argentina, Panamá, Costa Rica, Guatemala, República Dominicana y España.
- **Idioma:** español.
- **Página de destino:** https://microsuiteapps.com/p/licencialens

**Palabras clave:**
```
"licencias microsoft 365 sin usar"
"optimizar licencias microsoft 365"
"optimizar licencias office 365"
"reducir costos microsoft 365"
"auditoria licencias microsoft 365"
"reporte de licencias office 365"
"licencias office 365 inactivas"
"ahorrar en licencias microsoft"
[administrar licencias microsoft 365]
```
**Palabras negativas** (Palabras clave → Negativas):
```
gratis, crack, descargar, activador, key, clave, serial, comprar, estudiante, curso, certificacion, examen, trabajo, empleo
```

**Títulos** (máx. 30 caracteres; pon todos los que acepte):
```
Licencias M365 Sin Usar
Ahorra en Microsoft 365
Diagnóstico Gratis 14 Días
Detecta Licencias Inactivas
Cuánto Pierdes en Licencias
Reporte en 1 Minuto
Solo Lectura, Sin Riesgo
Para TI y MSP
Optimiza Office 365
Deja de Pagar de Más
```
**Descripciones** (máx. 90 caracteres):
```
Conecta tu tenant con permiso de solo lectura y ve cuántas licencias sobran y su costo.
Usuarios inactivos, cuentas bloqueadas con licencia y planes duplicados en un reporte.
14 días gratis, sin tarjeta. Planes desde US$29/mes. Varios tenants para MSP.
```

### Campaña B: LicenciaLens (inglés, para cuando la A funcione)
- **Ubicaciones:** Estados Unidos y Canadá. Ahí los clics son más caros pero los clientes pagan más.
- **Página de destino:** https://microsuiteapps.com/en/p/licencialens
- **Palabras clave:**
```
"unused microsoft 365 licenses"
"microsoft 365 license optimization"
"office 365 license audit"
"reduce microsoft 365 costs"
"office 365 inactive users licenses"
```
- **Títulos:**
```
Find Unused M365 Licenses
Cut Microsoft 365 Costs
Free 14-Day License Audit
Read-Only, Zero Risk
Built for IT Teams and MSPs
```
- **Descripciones:**
```
Connect your tenant read-only and see how many licenses are wasted and what they cost.
Inactive users, blocked accounts with licenses and duplicate plans in one report.
```

### Campaña C: Colombia (TributAlerta y DatosOK)
Crea **un grupo de anuncios por app**.
- **Ubicación:** Colombia.

**Grupo TributAlerta**
- **Página de destino:** https://microsuiteapps.com/p/tributalerta
- **Palabras clave:**
```
"software vencimientos dian"
"alertas calendario tributario"
"calendario tributario por nit"
"control vencimientos tributarios clientes"
"programa para contadores vencimientos"
```
- **Negativas:** `pdf, descargar, excel gratis, empleo, curso`
- **Títulos:**
```
Vencimientos DIAN por NIT
Alertas Antes de Cada Plazo
Para Contadores
Todos Tus Clientes en Uno
Prueba Gratis 14 Días
```
- **Descripción:**
```
Registra el NIT de tus clientes y recibe alertas 7, 3 y 1 día antes de cada plazo DIAN.
```

**Grupo DatosOK**
- **Página de destino:** https://microsuiteapps.com/p/datosok
- **Palabras clave:**
```
"autorizacion tratamiento de datos personales"
"cumplir ley 1581"
"habeas data empresas"
"registro autorizacion datos personales"
```
- **Títulos:**
```
Cumple la Ley 1581 Fácil
Autorizaciones con Evidencia
Habeas Data Sin Papeles
Formulario con QR
```
- **Descripción:**
```
Tus clientes autorizan desde el celular y queda la evidencia con fecha y hora ante la SIC.
```

---

## 3. Meta Ads (Facebook e Instagram), solo Colombia
- **Objetivo:** empieza con **Tráfico** (visitas a la página de destino). Después de 20–30 registros, crea una campaña de **Ventas/Clientes potenciales** optimizada para **CompleteRegistration**.
- **Ubicaciones:** Advantage+ (automáticas).
- **Formato:** imagen cuadrada 1080×1080 o video corto grabando la pantalla de la app. Canva sirve bien para esto.

| Conjunto | Público (intereses) | Edad | Página de destino |
|---|---|---|---|
| Contadores | Contaduría pública, Contador público, Revisoría fiscal, DIAN, Siigo, World Office | 24–60 | /p/tributalerta |
| SG-SST | Seguridad y salud en el trabajo, Salud ocupacional, ARL, Prevención de riesgos laborales | 22–55 | /p/sst0312 |
| Dueños de negocio | Pequeñas empresas, Emprendimiento, Administradores de página de negocios | 25–60 | /p/datosok |

**Textos:**

*TributAlerta*
> 📅 Contador: ¿cuántos vencimientos DIAN tienes este mes entre todos tus clientes?
> Con TributAlerta registras el NIT de cada cliente y te avisamos por correo antes de cada plazo: retención, IVA, renta, SIMPLE…
> ✅ 14 días gratis, sin tarjeta.

Titular: `No vuelvas a pagar una sanción` · Botón: **Registrarte**

*SST-0312*
> ¿Te toca la autoevaluación de estándares mínimos? 📋
> SST-0312 calcula el puntaje de la Resolución 0312 y arma el plan de mejoramiento en minutos. Ideal si llevas varias empresas.
> ✅ Prueba gratis 14 días.

Titular: `Autoevaluación 0312 en minutos` · Botón: **Más información**

*DatosOK*
> Si tu negocio guarda datos de clientes (nombre, cédula, teléfono), la Ley 1581 te exige su autorización… y poder demostrarla. ⚖️
> Con DatosOK la piden con un enlace o QR y queda la evidencia con fecha y hora.
> ✅ 14 días gratis.

Titular: `Cumple Habeas Data sin papeles` · Botón: **Registrarte**

---

## 4. Otros canales pagos (cuando tengas los primeros resultados)
| Canal | Costo aprox. | Cuándo usarlo |
|---|---|---|
| **LinkedIn Sales Navigator** | ~US$100/mes | Antes que los anuncios de LinkedIn: te deja encontrar y escribir a jefes de TI con filtros exactos. Úsalo con los mensajes de `VENTAS.md`. |
| **Anuncios de LinkedIn** | ~US$6–12 por clic | Solo para LicenciaLens y OffboardKit, segmentando por cargo "IT Manager/Jefe de TI" y empresas de 50–1000 empleados. Mínimo ~US$10/día. |
| **Capterra / GetApp (PPC)** | ~US$2–5 por clic | Después de publicarte gratis allí: aparecer arriba en "License Management" y "Help Desk". |
| **Patrocinio en newsletters o comunidades** | US$50–300 por envío | Newsletters de administradores de Microsoft 365 o comunidades de contadores. Pide sus estadísticas antes de pagar. |
| **Microcreadores** | US$50–200 por publicación | Contadores o profesionales SG-SST con 5–50 mil seguidores en TikTok, Instagram o LinkedIn que muestren la app. |

## 5. Revisión semanal (15 minutos cada lunes)
1. **Google Ads → Palabras clave → Términos de búsqueda.** Agrega como negativas las búsquedas que no tienen nada que ver.
2. **Mira el costo por registro de cada campaña.** Pausa lo que no funciona y sube un 20% a lo que sí.
3. **Escríbeles a los que se registraron esa semana** (Superadmin → Clientes) para ayudarles a configurar la app. Ese seguimiento personal es lo que convierte la prueba en pago.
