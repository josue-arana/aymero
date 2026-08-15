export const technicalDebtRegistry = {
  releaseReadinessEvidence: {
    rlsPoliciesDrafted: {
      complete: true,
      sourceHints: ['supabase/rls_*.sql', 'supabase/migrations/*_rls.sql'],
    },
    storagePlanCreated: {
      complete: true,
      sourceHints: ['supabase/README.md', 'supabase/migrations/20260628_enable_project_photos_storage_beta.sql'],
    },
  },
  todoItems: [
    {
      id: 'portalClientMessaging',
      titleKey: 'technicalDebtPortalMessagingTitle',
      descriptionKey: 'technicalDebtPortalMessagingDescription',
      severity: 'medium',
      affectedAreaKey: 'technicalDebtAreaClientPortal',
      nextActionKey: 'technicalDebtPortalMessagingNextAction',
      classification: 'backlog',
      whyItMattersKey: 'technicalDebtPortalMessagingWhy',
      priority: 'medium',
      dependencyKeys: ['technicalDebtDependencyMessagingProvider', 'technicalDebtDependencyConsentRules'],
      futureSprintAreaKey: 'technicalDebtSprintClientCommunication',
      sourceHint: 'developerHealthRegistry.todoItems',
    },
  ],
  comingSoonPages: [
    {
      id: 'paymentsPage',
      titleKey: 'technicalDebtPaymentsPageTitle',
      descriptionKey: 'technicalDebtPaymentsPageDescription',
      severity: 'medium',
      affectedAreaKey: 'payments',
      nextActionKey: 'technicalDebtPaymentsPageNextAction',
      classification: 'backlog',
      whyItMattersKey: 'technicalDebtPaymentsPageWhy',
      priority: 'medium',
      dependencyKeys: ['technicalDebtDependencyPaymentWorkspace', 'technicalDebtDependencyPaymentPermissions'],
      futureSprintAreaKey: 'technicalDebtSprintPaymentsWorkspace',
      sourceHint: 'developerHealthRegistry.comingSoonPages',
    },
  ],
}
