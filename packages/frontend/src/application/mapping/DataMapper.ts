export interface DataMapper<TSource, TTarget> {
  map(source: TSource): Promise<TTarget>;
}
