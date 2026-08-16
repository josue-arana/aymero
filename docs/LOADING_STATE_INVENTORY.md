# Aymero loading-state inventory

Sprint 3.40B inventory only. No loading visuals were redesigned in this sprint.

| Area / files | Current implementation | Surrounding shell and text | Reusable today? |
| --- | --- | --- | --- |
| Public Estimate — `src/pages/PublicEstimatePage.jsx` | Tailwind border circle with `animate-spin` | Full-viewport centered white card; `loadingEstimate` and `loadingEstimateHelp` | No; local `PublicEstimateState` also owns error states |
| Public Client Portal — `src/pages/CustomerPortalPage.jsx`, `src/pages/customerPortalPage.css` | Custom CSS rotating ring with a dark rounded-square core and reduced-motion rule | Full safe-area-aware viewport; `loadingClientPortal` and `loadingClientPortalHelp` | No; portal-specific component and CSS |
| Estimate/Contract paginated previews — `src/components/estimates/PaginatedEstimatePreview.jsx`, `src/components/contracts/PaginatedContractPreview.jsx` | Small blue pulsing update dot plus full US Letter shimmer skeleton | Preview-local status and page-shaped placeholder; translated preparing/updating text | Yes for Estimate and Contract only; shared paginator component |
| Invoice document preview — `src/components/invoices/InvoiceDocumentPreview.jsx` | Spinning Lucide `LoaderCircle` in an icon tile | `min-h-64` preview state card with `invoicePreviewLoading` | No; local `PreviewState`, also used for invoice preview errors |
| Browser print preparation — `src/utils/printDocument.js` | CSS border spinner rendered in the synchronously opened popup | Fixed white preparation overlay with no visible text; removed before printing; fixed fallback Print button remains for Safari lifecycle failures | No; embedded print-shell HTML/CSS |
| App/auth bootstrap — `src/App.jsx`, `src/components/auth/ProtectedRoute.jsx` | No visual indicator; returns `null` while auth resolves | Blank application surface | Shared behavior is duplicated between the app boundary and protected route, but there is no component |
| Lazy route/bootstrap fallbacks — `src/App.jsx` | `Suspense fallback={null}` or a blank `min-h-screen` slate surface | Developer routes are blank; onboarding uses an empty full-height background | No |
| Record detail loads — `src/pages/ProjectDetailPage.jsx`, `src/pages/LeadDetailPage.jsx`, `src/pages/InvoiceDetailPage.jsx` | Text-only state | Large centered white card with title/help copy | No; repeated markup with page-specific translations |
| Direct Estimate load — `src/pages/EstimateBuilderPage.jsx` | No spinner or text | Empty `min-h-64` white card with `aria-busy` | No |
| Jobs list load — `src/pages/JobsPage.jsx` | Text-only inline notice | Compact neutral callout using `loadingJobs` | No |
| Photo sections — `src/components/portal/PortalSummary.jsx`, `src/pages/ProjectDetailPage.jsx` | Text-only `Loading` state | Portal uses shared `EmptyState`; Project Workspace uses a dashed neutral card | Partially; `EmptyState` is reusable, the loading treatment is not standardized |
| Inline document actions — `src/pages/InvoiceDetailPage.jsx` | Spinning Lucide `LoaderCircle` replacing Print/Download icons | Existing action buttons with `preparingPrint` or action text | No shared loader; icon pattern is local |
| Password recovery — `src/pages/auth/ForgotPasswordPage.jsx` | Spinning Lucide `LoaderCircle` through `StatusBanner`'s `animateIcon` option | Informational status card with resolving title/body | Partially; `StatusBanner` is local to the page |
| Sample workspace installation — `src/pages/AuthOnboardingPage.jsx` | Spinning Lucide `LoaderCircle` with numeric progress | Onboarding footer status card with title, progress description, and count | No; progress-specific local UI |
| Inline save/submit actions — Estimate, Contract, Invoice, Settings, Calendar, Lead/Client/Job/Event/Payment/Photo/Send/Confirm modals and auth forms | Mostly text swaps such as `Saving`, `Loading`, `Signing in`, or `Creating account`; buttons disable while busy | Existing button shell; some actions retain a static icon, most have no motion | No shared inline busy component |

## Existing reusable building blocks

- `EmptyState` is reused for some portal sections, but it is not a loader and has no busy semantics or animation contract.
- `PaginatedEstimatePreview` provides one specialized document-preparation state shared by Estimate and Contract previews.
- `PreviewState`, `PublicEstimateState`, and `StatusBanner` are local helpers rather than application-wide loading components.
- No repository-wide loader component currently controls motion, size, safe-area layout, ARIA behavior, or translated loading copy.

## Recommended future architecture

Introduce a shared `AymeroLoader` after the visual design is approved. Keep data fetching in the owning page and let the component standardize presentation only.

Recommended variants:

- `page`: full-viewport/safe-area-aware bootstrap and public-route loading.
- `section`: card or content-region loading with an optional title and description.
- `inline`: button/action busy state with stable width and optional progress text.
- `document`: preview pagination and print preparation, including a non-printing popup preparation treatment.

The component should own consistent motion and reduced-motion behavior, `role="status"`, `aria-live`, `aria-busy` guidance, size tokens, and optional translated title/body slots. Progress-bearing workflows such as sample installation should compose a progress indicator with `AymeroLoader` rather than hiding progress inside the loader.

## Sprint 3.40C rollout disposition

- Public Estimate, public Client Portal, application/auth bootstrap, lazy onboarding/developer routes, Project Detail, Lead Detail, Invoice Detail, direct Estimate loading, Jobs loading, and project-photo sections now use the canonical `AymeroLoader`.
- Estimate and Contract pagination share the `document` variant for first preparation and the `inline` variant for recalculation. The previous animated page shimmer was removed because the page-shaped wrapper still communicates the eventual document geometry while the canonical loader communicates progress.
- Invoice preview preparation uses the `document` variant. Its distinct error boundary remains unchanged.
- Invoice print/download actions, password recovery resolution, and sample-workspace installation use the compact `inline` variant while retaining their visible labels or progress copy.
- Plain text swaps remain in save/submit buttons where the label and disabled state already communicate a short action and introducing animation would add visual noise or shift layout.
- The browser print shell mirrors Orbiting Flow only while its standalone popup is preparing. Loader nodes are removed from cloned content and excluded by print media before pagination/output.
- The unused `ProtectedRoute` implementation was removed after confirming no imports or call sites remained; the active authentication boundary is in `App.jsx`.
