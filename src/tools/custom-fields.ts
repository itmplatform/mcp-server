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

Custom field VALUES live in DataMart documents under "customFields", an object keyed by the field's display Name exactly as returned here (keys are case- and accent-sensitive and may contain trailing spaces). Query them with query_datamart, e.g. project: {"customFields": 1} or where: {"customFields.<Name>": {"$eq": ...}}. On accounts that work in several languages the key follows each component's language; definitions can be fetched per language (languageId 1=English, 2=Spanish, 3=Portuguese) to learn the variant names of the same BaseId. For RYGList, DropDownList, and List fields, get valid values with get_custom_field_options.`,
      inputSchema: {
        entity: z.enum(CUSTOM_FIELD_ENTITIES).describe('The entity type whose custom field definitions to retrieve'),
        languageId: z.number().optional().describe('Definition language: 1=English, 2=Spanish, 3=Portuguese. Defaults to your user language.'),
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
        languageId: z.number().optional().describe('Option language: 1=English, 2=Spanish, 3=Portuguese. Defaults to your user language.'),
      },
    },
    async (args) => {
      const path = buildCustomFieldOptionsPath(args.customFieldBaseId, args.languageId ?? sessionLanguageId);
      const data = await clients.rest.get(path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
