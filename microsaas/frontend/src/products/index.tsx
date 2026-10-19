import { ReactNode } from 'react'
import { tr } from '../i18n'
import * as assettrack from './assettrack'
import * as cobrabot from './cobrabot'
import * as datosok from './datosok'
import * as helpdesk from './helpdesk'
import * as lineacontrol from './lineacontrol'
import * as m365 from './m365'
import * as sst from './sst0312'
import * as tributalerta from './tributalerta'
import * as venceya from './venceya'

export type NavItem = { path: string; label: () => string; icon: string; element: ReactNode; hidden?: boolean }

/** Menú y pantallas de cada producto. path '' = pantalla inicial. */
export const PRODUCT_NAV: Record<string, NavItem[]> = {
  licencialens: [
    { path: '', label: () => tr('Resumen', 'Overview'), icon: '📊', element: <m365.LensDashboard /> },
    { path: 'history', label: () => tr('Historial', 'History'), icon: '🕑', element: <m365.LensHistory /> },
    { path: 'settings', label: () => tr('Precios y ajustes', 'Prices & settings'), icon: '⚙️', element: <m365.LensSettings /> },
  ],
  offboardkit: [
    { path: '', label: () => tr('Nuevo retiro', 'New offboarding'), icon: '🚪', element: <m365.OffboardHome /> },
    { path: 'runs', label: () => tr('Historial / actas', 'History / reports'), icon: '📄', element: <m365.OffboardRuns /> },
    { path: 'settings', label: () => tr('Plantilla', 'Template'), icon: '⚙️', element: <m365.OffboardSettings /> },
  ],
  assettrack: [
    { path: '', label: () => tr('Activos', 'Assets'), icon: '💻', element: <assettrack.Assets /> },
    { path: 'people', label: () => tr('Personas', 'People'), icon: '👤', element: <assettrack.People /> },
    { path: 'handovers', label: () => tr('Actas', 'Forms'), icon: '📝', element: <assettrack.Handovers /> },
  ],
  venceya: [
    { path: '', label: () => tr('Resumen', 'Overview'), icon: '📊', element: <venceya.Dashboard /> },
    { path: 'documents', label: () => tr('Documentos', 'Documents'), icon: '📄', element: <venceya.Documents /> },
    { path: 'entities', label: () => tr('Vehículos y personas', 'Vehicles & people'), icon: '🚚', element: <venceya.Entities /> },
  ],
  cobrabot: [
    { path: '', label: () => tr('Resumen', 'Overview'), icon: '📊', element: <cobrabot.Dashboard /> },
    { path: 'invoices', label: () => tr('Facturas', 'Invoices'), icon: '🧾', element: <cobrabot.Invoices /> },
    { path: 'customers', label: () => tr('Clientes', 'Customers'), icon: '👥', element: <cobrabot.Customers /> },
    { path: 'settings', label: () => tr('Recordatorios', 'Reminders'), icon: '⚙️', element: <cobrabot.Settings /> },
  ],
  tributalerta: [
    { path: '', label: () => tr('Vencimientos', 'Deadlines'), icon: '📅', element: <tributalerta.Deadlines /> },
    { path: 'clients', label: () => tr('Clientes', 'Clients'), icon: '🏢', element: <tributalerta.Clients /> },
    { path: 'custom', label: () => tr('Fechas propias', 'Custom dates'), icon: '📌', element: <tributalerta.Custom /> },
  ],
  lineacontrol: [
    { path: '', label: () => tr('Resumen', 'Overview'), icon: '📊', element: <lineacontrol.Dashboard /> },
    { path: 'lines', label: () => tr('Líneas', 'Lines'), icon: '📱', element: <lineacontrol.Lines /> },
    { path: 'bills', label: () => tr('Facturación', 'Billing'), icon: '🧾', element: <lineacontrol.Bills /> },
  ],
  datosok: [
    { path: '', label: () => tr('Resumen', 'Overview'), icon: '📊', element: <datosok.Dashboard /> },
    { path: 'requests', label: () => tr('Consultas y reclamos', 'Requests'), icon: '📨', element: <datosok.Requests /> },
    { path: 'consents', label: () => tr('Autorizaciones', 'Consents'), icon: '✅', element: <datosok.Consents /> },
    { path: 'policies', label: () => tr('Texto y finalidades', 'Text & purposes'), icon: '📜', element: <datosok.Policies /> },
  ],
  sst0312: [
    { path: '', label: () => tr('Empresas', 'Companies'), icon: '🏭', element: <sst.Companies /> },
    { path: 'actions', label: () => tr('Planes de mejora', 'Improvement plans'), icon: '✅', element: <sst.Actions /> },
    { path: 'company/:id', label: () => '', icon: '', element: <sst.CompanyDetail />, hidden: true },
    { path: 'assessment/:id', label: () => '', icon: '', element: <sst.AssessmentEditor />, hidden: true },
    { path: 'report/:id', label: () => '', icon: '', element: <sst.Report />, hidden: true },
  ],
  helpdesk: [
    { path: '', label: () => tr('Tickets', 'Tickets'), icon: '🎫', element: <helpdesk.Tickets /> },
    { path: 'clients', label: () => tr('Clientes', 'Clients'), icon: '🏢', element: <helpdesk.Clients /> },
    { path: 'report', label: () => tr('Reporte SLA', 'SLA report'), icon: '📈', element: <helpdesk.Report /> },
    { path: 'settings', label: () => tr('Configuración', 'Settings'), icon: '⚙️', element: <helpdesk.Settings /> },
  ],
}
