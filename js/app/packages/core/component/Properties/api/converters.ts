import type { PropertyValue } from '@service-properties/generated/schemas/propertyValue';
import { match } from 'ts-pattern';
import { NUMBER_DECIMAL_PLACES } from '../constants';
import type {
  EntityPropertyWithDefinition,
  EntityReference,
  Property,
  PropertyApiValues,
  SetPropertyValue,
  ValueType,
} from '../types';
import { isEntityReferenceArray, isStringArray } from '../utils/typeGuards';

/**
 * Normalized flat value type for PropertyApiValues conversion
 * Contains the actual value with proper TypeScript typing based on the PropertyApiValues type
 */
export type NormalizedPropertyValue =
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: number }
  | { type: 'BOOLEAN'; value: boolean }
  | { type: 'DATE'; value: Date }
  | { type: 'SELECT_OPTION'; value: string[] }
  | { type: 'ENTITY_REFERENCE'; value: EntityReference[] }
  | { type: 'LINK'; value: string[] }
  | { type: 'EMPTY'; value: null };

/**
 * Type guard to check if PropertyValue has a specific type
 */
function hasPropertyValueType(
  value: PropertyValue | null | undefined,
  type: string
): value is PropertyValue & { type: string; value: unknown } {
  return (
    value !== null &&
    value !== undefined &&
    'type' in value &&
    value.type === type &&
    'value' in value
  );
}

/**
 * Convert EntityPropertyWithDefinition from API format to domain Property type
 *
 * Transforms the nested API response structure into a flat, strongly-typed domain model.
 * Handles all value types with proper type guards and formatting.
 */
export function entityPropertyFromApi(
  apiProperty: EntityPropertyWithDefinition
): Property {
  const baseProperty = {
    propertyId: apiProperty.property.id,
    propertyDefinitionId: apiProperty.definition.id,
    displayName: apiProperty.definition.display_name,
    isMultiSelect: apiProperty.definition.is_multi_select,
    isMetadata: apiProperty.definition.is_metadata,
    isSystemProperty: apiProperty.definition.is_system,
    options: apiProperty.options ?? undefined,
    owner: apiProperty.definition.owner,
    specificEntityType: apiProperty.definition.specific_entity_type,
    createdAt: apiProperty.property.created_at,
    updatedAt: apiProperty.property.updated_at,
  };

  const propertyValue = apiProperty.value;
  const valueType = apiProperty.definition.data_type as ValueType;

  // Handle each value type with proper type checking
  return match(valueType)
    .with('STRING', () => {
      if (hasPropertyValueType(propertyValue, 'String')) {
        const stringVal = propertyValue.value;
        if (typeof stringVal === 'string' && stringVal) {
          return {
            ...baseProperty,
            valueType: 'STRING' as const,
            value: stringVal,
          };
        }
      }
      return { ...baseProperty, valueType: 'STRING' as const, value: null };
    })
    .with('NUMBER', () => {
      if (hasPropertyValueType(propertyValue, 'Number')) {
        const numVal = propertyValue.value;
        if (
          typeof numVal === 'number' &&
          numVal !== undefined &&
          numVal !== null
        ) {
          return {
            ...baseProperty,
            valueType: 'NUMBER' as const,
            value: parseFloat(numVal.toFixed(NUMBER_DECIMAL_PLACES)),
          };
        }
      }
      return { ...baseProperty, valueType: 'NUMBER' as const, value: null };
    })
    .with('BOOLEAN', () => {
      if (hasPropertyValueType(propertyValue, 'Boolean')) {
        const boolVal = propertyValue.value;
        if (typeof boolVal === 'boolean') {
          return {
            ...baseProperty,
            valueType: 'BOOLEAN' as const,
            value: boolVal,
          };
        }
      }
      return { ...baseProperty, valueType: 'BOOLEAN' as const, value: null };
    })
    .with('DATE', () => {
      if (hasPropertyValueType(propertyValue, 'Date')) {
        const dateVal = propertyValue.value;
        if (
          dateVal &&
          (typeof dateVal === 'string' || typeof dateVal === 'number')
        ) {
          return {
            ...baseProperty,
            valueType: 'DATE' as const,
            value: new Date(dateVal),
          };
        }
      }
      return { ...baseProperty, valueType: 'DATE' as const, value: null };
    })
    .with('SELECT_STRING', 'SELECT_NUMBER', (vt) => {
      if (hasPropertyValueType(propertyValue, 'SelectOption')) {
        const selectVal = propertyValue.value;
        if (isStringArray(selectVal)) {
          return {
            ...baseProperty,
            valueType: vt,
            value: selectVal,
          };
        }
      }
      return { ...baseProperty, valueType: vt, value: null };
    })
    .with('ENTITY', () => {
      if (hasPropertyValueType(propertyValue, 'EntityReference')) {
        const entityVal = propertyValue.value;
        if (isEntityReferenceArray(entityVal)) {
          return {
            ...baseProperty,
            valueType: 'ENTITY' as const,
            value: entityVal,
          };
        }
      }
      return { ...baseProperty, valueType: 'ENTITY' as const, value: null };
    })
    .with('LINK', () => {
      if (hasPropertyValueType(propertyValue, 'Link')) {
        const linkVal = propertyValue.value;
        if (isStringArray(linkVal)) {
          return {
            ...baseProperty,
            valueType: 'LINK' as const,
            value: linkVal,
          };
        }
      }
      return { ...baseProperty, valueType: 'LINK' as const, value: null };
    })
    .exhaustive();
}

/**
 * Convert PropertyApiValues from domain format to API SetPropertyValue format
 *
 * Transforms typed property values into the API's expected format, handling:
 * - Primitive types (string, number, date, boolean)
 * - Select types (single and multi-select for both string and number options)
 * - Entity references (single and multi-entity for all entity types)
 * - Number formatting to 4 decimal places
 */
export function propertyValueToApi(
  apiValues: PropertyApiValues,
  isMultiSelect: boolean
): SetPropertyValue | null {
  return match(apiValues)
    .with({ valueType: 'STRING' }, (v) => {
      if (v.value == null) {
        return null;
      }
      return {
        type: 'string' as const,
        value: v.value,
      };
    })
    .with({ valueType: 'NUMBER' }, (v) => {
      if (v.value == null) {
        return null;
      }
      return {
        type: 'number' as const,
        value: parseFloat(v.value.toFixed(NUMBER_DECIMAL_PLACES)),
      };
    })
    .with({ valueType: 'DATE' }, (v) => {
      if (v.value == null) {
        return null;
      }
      return {
        type: 'date' as const,
        value: v.value.toISOString(),
      };
    })
    .with({ valueType: 'BOOLEAN' }, (v) => {
      if (v.value == null) {
        return null;
      }
      return {
        type: 'boolean' as const,
        value: v.value,
      };
    })
    .with({ valueType: 'SELECT_STRING' }, { valueType: 'SELECT_NUMBER' }, (v) => {
      if (!v.values || v.values.length === 0) {
        return null;
      }
      if (isMultiSelect) {
        return {
          type: 'multi_select_option' as const,
          option_ids: v.values,
        };
      }
      return {
        type: 'select_option' as const,
        option_id: v.values[0],
      };
    })
    .with({ valueType: 'ENTITY' }, (v) => {
      if (!v.refs || v.refs.length === 0) {
        return null;
      }
      if (isMultiSelect) {
        return {
          type: 'multi_entity_reference' as const,
          references: v.refs,
        };
      }
      return {
        type: 'entity_reference' as const,
        reference: v.refs[0],
      };
    })
    .with({ valueType: 'LINK' }, (v) => {
      if (!v.values || v.values.length === 0) {
        return null;
      }
      if (isMultiSelect) {
        return {
          type: 'multi_link' as const,
          urls: v.values,
        };
      }
      return {
        type: 'link' as const,
        url: v.values[0],
      };
    })
    .exhaustive();
}

/**
 * Convert PropertyApiValues from domain format to a normalized flat value structure
 *
 * Transforms the PropertyApiValues discriminated union into a simplified format with:
 * - Consistent type field naming
 * - Properly typed value field
 * - Normalized handling of all value types including empty/null values
 */
export function propertyApiValuesToNormalized(
  apiValues: PropertyApiValues | null | undefined
): NormalizedPropertyValue {
  // Handle null/undefined values
  if (!apiValues) {
    return { type: 'EMPTY', value: null };
  }

  // Handle each PropertyApiValues type
  return match(apiValues)
    .with({ valueType: 'STRING' }, (v): NormalizedPropertyValue => {
      if (v.value !== null && typeof v.value === 'string') {
        return { type: 'STRING', value: v.value };
      }
      return { type: 'EMPTY', value: null };
    })
    .with({ valueType: 'NUMBER' }, (v): NormalizedPropertyValue => {
      if (
        v.value !== null &&
        typeof v.value === 'number' &&
        !isNaN(v.value)
      ) {
        return {
          type: 'NUMBER',
          value: parseFloat(v.value.toFixed(NUMBER_DECIMAL_PLACES)),
        };
      }
      return { type: 'EMPTY', value: null };
    })
    .with({ valueType: 'BOOLEAN' }, (v): NormalizedPropertyValue => {
      if (v.value !== null && typeof v.value === 'boolean') {
        return { type: 'BOOLEAN', value: v.value };
      }
      return { type: 'EMPTY', value: null };
    })
    .with({ valueType: 'DATE' }, (v): NormalizedPropertyValue => {
      if (v.value !== null && v.value instanceof Date) {
        if (!isNaN(v.value.getTime())) {
          return { type: 'DATE', value: v.value };
        }
      }
      return { type: 'EMPTY', value: null };
    })
    .with(
      { valueType: 'SELECT_STRING' },
      { valueType: 'SELECT_NUMBER' },
      (v): NormalizedPropertyValue => {
        if (v.values && isStringArray(v.values)) {
          return { type: 'SELECT_OPTION', value: v.values };
        }
        return { type: 'EMPTY', value: null };
      }
    )
    .with({ valueType: 'ENTITY' }, (v): NormalizedPropertyValue => {
      if (v.refs && isEntityReferenceArray(v.refs)) {
        return { type: 'ENTITY_REFERENCE', value: v.refs };
      }
      return { type: 'EMPTY', value: null };
    })
    .with({ valueType: 'LINK' }, (v): NormalizedPropertyValue => {
      if (v.values && isStringArray(v.values)) {
        return { type: 'LINK', value: v.values };
      }
      return { type: 'EMPTY', value: null };
    })
    .exhaustive();
}
