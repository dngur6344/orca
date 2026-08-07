import { z } from 'zod'

export const CLIENT_UI_NAVIGATION_UPDATE_FIELDS = {
  // Why: startup alone restores activeView, so sync broadcasts cannot yank another window's page.
  activeView: z
    .enum([
      'terminal',
      'settings',
      'tasks',
      'activity',
      'automations',
      'runs',
      'space',
      'skills',
      'mobile'
    ])
    .optional(),
  runConsoleRuntimeTargetKey: z.string().max(512).nullable().optional(),
  runConsoleSelectedRunId: z.string().max(512).nullable().optional(),
  runConsoleSelectedTaskId: z.string().max(512).nullable().optional(),
  runConsoleViewMode: z.enum(['graph', 'outline']).optional()
}
