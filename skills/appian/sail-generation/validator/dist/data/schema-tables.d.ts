/**
 * Pre-compiled schema lookup tables derived from guidelines/ui-guidelines/reference/schemas/
 * Structure: componentName -> paramName -> Set of valid enum values (null = accepts any value)
 * Components with acceptsHexColors have hex validated separately.
 */
export type ParamEnums = Record<string, readonly string[] | null>;
export type ComponentSchema = Record<string, ParamEnums>;
/**
 * Main schema lookup table.
 * Key: component function name (e.g. "a!buttonWidget")
 * Value: map of paramName -> allowed string enum values (null = no enum restriction)
 *
 * Only enum-validated parameters are listed. Boolean/Any/Text params are omitted.
 * Parameters marked acceptsHexColors are validated separately by hex pattern check.
 */
export declare const COMPONENT_SCHEMAS: ComponentSchema;
/**
 * Parameters that accept hex colors (#RRGGBB or #RRGGBBAA) IN ADDITION to their enum values.
 * Used by the hex validator to skip false-positive hex-value warnings.
 */
export declare const HEX_ACCEPTING_PARAMS: Set<string>;
