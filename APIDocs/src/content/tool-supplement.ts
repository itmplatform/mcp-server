export interface ToolEditorial {
  category: string
  narrative: string
  exampleResponse?: unknown
}

export const TOOL_CATEGORIES = [
  'Projects & Services',
  'Tasks',
  'Financials',
  'Risks & Issues',
  'Portfolio',
  'Users & Reference',
  'Write Operations',
] as const

export const toolSupplement: Record<string, ToolEditorial> = {
  search_projects: {
    category: 'Projects & Services',
    narrative:
      'When you ask "Which projects are behind schedule?" or "Show me all active projects," the AI calls this tool with filters and examines the results to answer your question.',
    exampleResponse: {
      projects: [
        { id: 75868, name: 'Website Redesign', statusLabel: 'In Progress', percentComplete: 65 },
        { id: 75901, name: 'Mobile App v3', statusLabel: 'In Progress', percentComplete: 30 },
      ],
      total: 12,
    },
  },
  get_project: {
    category: 'Projects & Services',
    narrative:
      'When you ask for details about a specific project, the AI calls this tool with the project ID and optionally requests tasks, risks, issues, or budget data in a single query.',
    exampleResponse: {
      id: 75868,
      name: 'Website Redesign',
      statusLabel: 'In Progress',
      percentComplete: 65,
      startDate: '2026-01-15',
      endDate: '2026-06-30',
      managers: [{ name: 'Jane Smith' }],
    },
  },
  search_services: {
    category: 'Projects & Services',
    narrative:
      'Similar to search_projects but for services (ongoing operations without a fixed end date). The AI uses this when you ask about services or operational activities.',
    exampleResponse: {
      services: [
        { id: 80210, name: 'IT Support', statusLabel: 'Active', customTypeLabel: 'Internal' },
      ],
      total: 5,
    },
  },
  get_service: {
    category: 'Projects & Services',
    narrative:
      'Retrieves full details for a specific service, optionally including activities, purchases, revenues, and budget.',
    exampleResponse: {
      id: 80210,
      name: 'IT Support',
      statusLabel: 'Active',
      startDate: '2026-01-01',
    },
  },
  list_project_tasks: {
    category: 'Tasks',
    narrative:
      'When you ask "What tasks are in the Website Redesign project?" or "Show me overdue tasks," the AI calls this tool to list all tasks for a project.',
    exampleResponse: {
      tasks: [
        { taskId: 112233, name: 'Design wireframes', statusLabel: 'Completed', percentComplete: 100 },
        { taskId: 112234, name: 'Develop homepage', statusLabel: 'In Progress', percentComplete: 40 },
      ],
    },
  },
  get_project_budget: {
    category: 'Financials',
    narrative:
      'When you ask "How is the budget looking for this project?", the AI calls this tool to get four budget perspectives: planned, estimated, forecast, and actual spend.',
    exampleResponse: {
      budgetTopDown: { effort: 500, cost: 75000 },
      budgetBottomUp: { effort: 480, cost: 72000 },
      budgetActual: { effort: 200, cost: 30000 },
    },
  },
  get_project_purchases: {
    category: 'Financials',
    narrative:
      'Retrieves purchase orders for a project. The AI uses this when you ask about procurement, vendor costs, or purchase status.',
    exampleResponse: {
      purchases: [
        { id: 5001, description: 'Design software license', amount: 1200, statusLabel: 'Approved' },
      ],
    },
  },
  get_project_revenues: {
    category: 'Financials',
    narrative:
      'Retrieves revenue items for a project. The AI uses this when you ask about project income, billing, or revenue tracking.',
    exampleResponse: {
      revenues: [
        { id: 6001, description: 'Phase 1 milestone payment', amount: 25000, statusLabel: 'Invoiced' },
      ],
    },
  },
  get_project_risks: {
    category: 'Risks & Issues',
    narrative:
      'When you ask "What are the risks for this project?", the AI calls this tool to retrieve the risk register with probability, impact, and mitigation plans.',
    exampleResponse: {
      risks: [
        { id: 7001, name: 'Resource shortage', statusLabel: 'Open', probabilityLabel: 'Medium', impactLabel: 'High' },
      ],
    },
  },
  get_project_issues: {
    category: 'Risks & Issues',
    narrative:
      'Retrieves the issue log for a project. The AI uses this when you ask about problems, blockers, or open issues.',
    exampleResponse: {
      issues: [
        { id: 8001, name: 'API integration delay', statusLabel: 'Open', severityLabel: 'High' },
      ],
    },
  },
  aggregate_portfolio: {
    category: 'Portfolio',
    narrative:
      'When you ask "How many projects are in each status?" or "What is the total budget by methodology?", the AI runs portfolio-level analytics using this tool.',
    exampleResponse: {
      groups: [
        { key: 'In Progress', count: 15, avgProgress: 42, totalBudget: 500000 },
        { key: 'Closed', count: 8, avgProgress: 100, totalBudget: 320000 },
      ],
    },
  },
  query_datamart: {
    category: 'Portfolio',
    narrative:
      'For advanced analysis beyond the typed tools, the AI can run custom DataMart queries. This is used for complex filtering, aggregations, or cross-cutting portfolio analysis.',
    exampleResponse: {
      data: [
        { name: 'Website Redesign', statusLabel: 'In Progress', 'budget.actual.cost': 30000 },
      ],
      _meta: { total: 1 },
    },
  },
  search_users: {
    category: 'Users & Reference',
    narrative:
      'When you ask "Who is on the team?" or search for a specific person, the AI calls this tool to find team members by name or email.',
    exampleResponse: {
      users: [
        { userId: 1001, name: 'Jane Smith', email: 'jane@example.com', role: 'Full User' },
      ],
    },
  },
  get_user: {
    category: 'Users & Reference',
    narrative:
      'Retrieves full details for a specific user, including roles, categories, and contact information.',
    exampleResponse: {
      userId: 1001,
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'Full User',
    },
  },
  get_reference_data: {
    category: 'Users & Reference',
    narrative:
      'When the AI needs to understand valid values for statuses, types, or priorities, it calls this tool. This helps it interpret data and set correct values when creating or updating items.',
    exampleResponse: {
      items: [
        { Id: 1, Name: 'Open' },
        { Id: 2, Name: 'In Progress' },
        { Id: 3, Name: 'Closed' },
      ],
    },
  },
  create_task: {
    category: 'Write Operations',
    narrative:
      'When you ask "Create a task called X in the Website Redesign project," the AI calls this tool. The created task is read back from the API to confirm it was saved correctly.',
    exampleResponse: {
      TaskId: 112235,
      Name: 'Review design mockups',
      StatusId: 1,
      ProjectId: 75868,
    },
  },
  update_task: {
    category: 'Write Operations',
    narrative:
      'When you ask "Mark the Design wireframes task as complete" or "Change the priority of task X," the AI calls this tool with only the fields that need to change.',
    exampleResponse: {
      TaskId: 112233,
      Name: 'Design wireframes',
      StatusId: 3,
      PercentComplete: 100,
    },
  },
  create_risk: {
    category: 'Write Operations',
    narrative:
      'When you ask "Log a risk about resource shortage in the Website Redesign project," the AI creates a risk entry with the details you provide.',
    exampleResponse: {
      RiskId: 7002,
      Name: 'Key developer unavailable',
      StatusId: 1,
      ProjectId: 75868,
    },
  },
  create_issue: {
    category: 'Write Operations',
    narrative:
      'When you ask "Log an issue about the API integration delay," the AI creates an issue entry in the specified project.',
    exampleResponse: {
      IssueId: 8002,
      Name: 'Third-party API outage',
      StatusId: 1,
      ProjectId: 75868,
    },
  },
  update_project: {
    category: 'Write Operations',
    narrative:
      'When you ask "Change the Website Redesign status to On Hold" or "Update the project end date," the AI calls this tool with only the fields that need to change.',
    exampleResponse: {
      ProjectId: 75868,
      Name: 'Website Redesign',
      ProjectStatusId: 2,
    },
  },
  list_service_activities: {
    category: 'Projects & Services',
    narrative:
      'When you ask "What activities does the IT Support service have?", the AI lists the activities of a service with pagination.',
    exampleResponse: {
      items: [{ id: 91001, name: 'Ticket triage', percentComplete: 40 }],
      total: 6,
    },
  },
  get_service_purchases: {
    category: 'Financials',
    narrative:
      'Like get_project_purchases but for services: lists the purchase orders of a service with pagination.',
    exampleResponse: {
      items: [{ id: 5101, description: 'Monitoring licenses', amount: 1200 }],
      total: 3,
    },
  },
  get_service_revenues: {
    category: 'Financials',
    narrative:
      'Like get_project_revenues but for services: lists the revenue items of a service with pagination.',
    exampleResponse: {
      items: [{ id: 6101, description: 'Support retainer', amount: 5000 }],
      total: 2,
    },
  },
  list_task_progress: {
    category: 'Tasks',
    narrative:
      'When you ask "How has the API migration task progressed?", the AI lists the task\'s progress (follow-up) history, newest first. Task progress is a time-series of dated entries, not a single field on the task.',
    exampleResponse: [
      { TaskFollowUpId: 9012, Percentage: 60, ShortDescription: 'Backend done', ReportDate: '2026-07-10T09:30:00' },
      { TaskFollowUpId: 8998, Percentage: 30, ShortDescription: 'Kickoff', ReportDate: '2026-07-01T14:00:00' },
    ],
  },
  get_project_progress: {
    category: 'Projects & Services',
    narrative:
      'When you ask "Is the Website Redesign on track?", the AI compares the expected progress curve (from task dates and working days) and the baseline curve against the actual follow-up history.',
    exampleResponse: {
      Expected: [{ Date: '2026-07-01', Percentage: 45 }],
      BaselineExpected: [{ Date: '2026-07-01', Percentage: 50 }],
      FollowUps: [{ Date: '2026-07-01', Percentage: 40 }],
    },
  },
  create_task_progress: {
    category: 'Write Operations',
    narrative:
      'When you say "Report 60% progress on the API migration task," the AI creates a progress entry with a date, percentage, assessment rating, and summary. This is the correct way to set task completion: it triggers status transitions, parent rollups, and automatic project progress. Assessment ratings are discovered with get_reference_data.',
    exampleResponse: {
      TaskFollowUpId: 9013,
      TaskId: 1859241,
      Percentage: 60,
      AssessmentId: 152744,
      ShortDescription: 'Backend migration complete',
      ReportDate: '2026-07-13T10:00:00',
    },
  },
  update_task_progress: {
    category: 'Write Operations',
    narrative:
      'When you ask "Correct yesterday\'s progress entry to 75%," the AI updates an existing progress entry, sending only the fields that change.',
    exampleResponse: {
      TaskFollowUpId: 9013,
      TaskId: 1859241,
      Percentage: 75,
      ShortDescription: 'Backend migration complete',
    },
  },
}
