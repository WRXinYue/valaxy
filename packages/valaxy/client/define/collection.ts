export interface CollectionConfig {
  /**
   * auto-generated by your collection path
   * @example /collections/love-letters/1 => id: 'love-letters'
   */
  id?: string
  /**
   * @en
   * The name of the collection.
   *
   * @zh
   * 合集名称
   */
  name?: string
  cover?: string
  description?: string
  categories?: string[]
  tags?: string[]
}

/**
 * @experimental
 * @description Define the collection configuration.
 */
export function defineCollection(config: CollectionConfig) {
  return config
}