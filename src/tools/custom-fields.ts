import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../clients/index.js';
import type { EffectiveUserContext } from '../auth/effective-user-context.js';

export const CUSTOM_FIELD_ENTITIES = [
  'project', 'task', 'risk', 'issue', 'service', 'activity', 'purchase', 'revenue',
] as const;

type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

const ENTITY_PATHS: Record<CustomFieldEntity, string> = {
  project: 'Projects',
  task: 'Tasks',
  risk: 'Risks',
  issue: 'Issues',
  service: 'Services',
  activity: 'Activities',
  purchase: 'Purchases',
  revenue: 'Revenues',
};

const DEFAULT_LANGUAGE_ID = 1; // English (backend default)

export function buildCustomFieldsPath(entity: CustomFieldEntity, languageId: number): string {
  return `${ENTITY_PATHS[entity]}/CustomFields?LanguageId=${languageId}`;
}

export function buildCustomFieldOptionsPath(customFieldBaseId: number, languageId: number): string {
  return `CustomFieldOptions/${customFieldBaseId}?LanguageId=${languageId}`;
}

export function registerCustomFieldTools(
  server: McpServer,
  clients: Clients,
  effectiveUserContext?: EffectiveUserContext,
): void {
  const sessionLanguageId = effectiveUserContext?.languageId || DEFAULT_LANGUAGE_ID;

  server.registerTool(
    'get_custom_fields',
    {
      description: `Get the account's custom field definitions for an entity type: project, task, risk, issue, service, activity, purchase, or revenue. Returns Id, BaseId, Name, TypeId, TypeName (Text, Number, Percentage, Date, HTML, RYGList, DropDownList, List), Description, Required.

VALUES live in DataMart under "customFields", keyed by the display Name exactly as returned here (case- and accent-sensitive, may contain trailing spaces). Query via query_datamart, e.g. project {"customFields": 1} or where {"customFields.<Name>": ...}. On multilingual accounts the key follows each component's language; fetch definitions per languageId to learn the variant names of the same BaseId. Dropdown values: get_custom_field_options.`,
      inputSchema: {
        entity: z.enum(CUSTOM_FIELD_ENTITIES).describe('The entity type whose custom field definitions to retrieve'),
        languageId: z.number().optional().describe('Language: 1=English, 2=Spanish, 3=Portuguese (default: your user language)'),
      },
    },
    async (args) => {
      const path = buildCustomFieldsPath(args.entity, args.languageId ?? sessionLanguageId);
      const data = await clients.rest.get(path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    'get_custom_field_options',
    {
      description: 'Get the selectable options of a dropdown custom field (RYGList, DropDownList, or List types), using the BaseId returned by get_custom_fields. Returns Id, BaseId, Text, Color (RYG lists), SortOrder, IsDefault. The option Text is the value stored in DataMart "customFields" for the component.',
      inputSchema: {
        customFieldBaseId: z.number().describe('The custom field BaseId from get_custom_fields'),
        languageId: z.number().optional().describe('Language: 1=English, 2=Spanish, 3=Portuguese (default: your user language)'),
      },
    },
    async (args) => {
      const path = buildCustomFieldOptionsPath(args.customFieldBaseId, args.languageId ?? sessionLanguageId);
      const data = await clients.rest.get(path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
