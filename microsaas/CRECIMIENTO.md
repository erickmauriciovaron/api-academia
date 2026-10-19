# Plan de crecimiento: de 0 a los primeros 10 clientes (y luego al mundo)

Las cifras de costos y comisiones son **estimaciones**: verifica las tarifas vigentes de cada proveedor.

## 1. Rentabilidad: los números
| Concepto | Valor aprox. |
|---|---|
| Droplet 2 GB (DigitalOcean) | ~USD 12/mes |
| Dominio .com | ~USD 12/año (~USD 1/mes) |
| Correo (Brevo plan gratis, 300/día) | USD 0 |
| Comisión PayPal por cobro internacional | ~5–6 % + tarifa fija (ver paypal.com/co) |
| **Punto de equilibrio** | **1 cliente** del plan más barato cubre el servidor |
| 10 clientes a USD 25 promedio | ~USD 235/mes netos |
| 40 clientes a USD 25 promedio | ~USD 940/mes netos (sigue cabiendo en el mismo Droplet) |

El plan anual (2 meses gratis) adelanta caja: ofrécelo siempre en el cierre.

## 2. Para que “aparezca a todo el mundo” (checklist técnico)
1. **Dominio propio** (lo más importante para la confianza y Google). Ej.: `microsuite.app` o uno por app (`licencialens.com`). Crea un registro A hacia `198.199.90.111` y vuelve a ejecutar:
   `DOMAIN=tudominio.com ADMIN_EMAIL=tu@correo bash deploy/install.sh`
   Para dominios por app: `EXTRA_DOMAINS="licencialens.com venceya.app" PRODUCT_DOMAINS="licencialens.com=licencialens,venceya.app=venceya"`.
2. **PayPal en modo real:** developer.paypal.com → Live → crea la app → en **Superadmin → Integraciones** cambia el modo a `live`, pega el Client ID y el Secret Live → **Configurar planes y webhook**.
3. **Correo (SMTP)** en Integraciones (Brevo gratis) y verifica SPF y DKIM del dominio.
4. **Google Search Console** (search.google.com/search-console): agrega el dominio, verifícalo por DNS y envía `https://tudominio.com/sitemap.xml`. Haz lo mismo en **Bing Webmaster Tools** (también alimenta a ChatGPT y Copilot).
5. **Analítica:** crea una propiedad de Google Analytics 4 y pega el ID `G-…` en Integraciones. Ya se miden `sign_up`, `begin_checkout` y `purchase` con su valor en USD.

Ya está construido en la plataforma:
- Páginas prerenderizadas en español e inglés (`/p/<app>`, `/en/p/<app>`).
- Sitemap con hreflang, robots.txt y datos estructurados (SoftwareApplication con precios y FAQ).
- Imagen de vista previa por app para WhatsApp, LinkedIn y Facebook.

## 3. Dónde publicar las apps (gratis)
| Directorio | Apps |
|---|---|
| **Microsoft AppSource / Marketplace** (Partner Center) | LicenciaLens, OffboardKit: allí buscan los administradores de M365 |
| Capterra / GetApp / Software Advice (un solo registro en Gartner Digital Markets) | Todas |
| G2 | LicenciaLens, AssetTrack, HelpDesk Lite |
| Product Hunt (lanzar un martes o miércoles) | Suite completa o LicenciaLens |
| AlternativeTo, SaaSHub | Como alternativa a CoreView, Snipe-IT, Freshdesk o Expiration Reminder |
| Google Business Profile | Tu negocio de consultoría, con enlace a las apps |

## 4. Primeros 10 clientes en 30 días
**Semana 1: contactos calientes.** Escribe a los clientes y contactos que tenías en HelpDesk TI, GestorLineas y AssetTrack (o en Odoo). Oferta: *“migro tus datos gratis y te dejo 3 meses al 50 %”*.

**Semana 2: LicenciaLens (el ticket más alto).** Envía 30 mensajes al día por LinkedIn a “Jefe de TI”, “IT Manager” y dueños de MSP. Gancho: *diagnóstico gratis de licencias de Microsoft 365 desperdiciadas*. Los textos listos están en el PASO 2 del chat.

**Semana 3: nichos de Colombia en grupos.**
- TributAlerta: grupos de Facebook y WhatsApp de contadores, Juntas de contadores regionales.
- SST-0312: grupos de profesionales SG-SST, ARL y consultores.
- DatosOK: clínicas, odontólogos, colegios e inmobiliarias. Mensaje: *“las sanciones de la SIC por Habeas Data están publicadas; ¿tienes las autorizaciones con evidencia?”*.

**Semana 4: contenido y SEO.** Publica 1 artículo por app en LinkedIn con su enlace, por ejemplo: *“Cuánto dinero pierde una pyme en licencias de M365 que nadie usa”*, *“Checklist de la Res. 0312 en 10 minutos”* o *“Calendario DIAN: cómo no pagar sanción mínima”*.

### Oferta de lanzamiento (mientras no haya 10 clientes)
- 14 días gratis sin tarjeta (ya activo).
- Plan anual = 2 meses gratis (ya activo).
- Cortesía o extensión de prueba manual desde **Superadmin → Clientes** para cerrar a los indecisos.

## 5. Métricas semanales (en Superadmin y en Google Analytics)
| Métrica | Dónde | Meta mes 1 |
|---|---|---|
| Visitas a landings | GA4 | 500 |
| Registros (`sign_up`) | GA4 / Superadmin | 30 |
| Pruebas que pagan | Superadmin → Resumen | 10 % o más |
| MRR | Superadmin → Resumen | USD 250 |
| Cancelaciones | Superadmin → Resumen | < 5 % mensual |

Regla práctica: si una app no consigue registros en 4 semanas de difusión, deja de promoverla y concentra el esfuerzo en las 2–3 que sí convierten.
