declare module "d3" {
  export interface ArcDatum {
    startAngle: number;
    endAngle: number;
  }

  export interface ArcGenerator<T extends ArcDatum = ArcDatum> {
    innerRadius(radius: number): ArcGenerator<T>;
    outerRadius(radius: number): ArcGenerator<T>;
    cornerRadius(radius: number): ArcGenerator<T>;
    (datum: T): string | null;
  }

  export function arc<T extends ArcDatum = ArcDatum>(): ArcGenerator<T>;

  export function interpolateNumber(a: number, b: number): (t: number) => number;

  export function easeCubicOut(t: number): number;

  export interface HierarchyDatum {
    [key: string]: unknown;
    children?: HierarchyDatum[];
  }

  export interface HierarchyNode<T extends HierarchyDatum = HierarchyDatum> {
    data: T;
    depth: number;
    height: number;
    value?: number;
    x: number;
    y: number;
    r: number;
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
    parent?: HierarchyNode<T> | null;
    children?: HierarchyNode<T>[];
    descendants(): HierarchyNode<T>[];
    leaves(): HierarchyNode<T>[];
    sum(valueFn: (datum: T) => number): HierarchyNode<T>;
    sort(compare: (a: HierarchyNode<T>, b: HierarchyNode<T>) => number): HierarchyNode<T>;
  }

  export function hierarchy<T extends HierarchyDatum>(data: T): HierarchyNode<T>;

  export interface PackLayout<T extends HierarchyDatum = HierarchyDatum> {
    size(size: [number, number]): PackLayout<T>;
    padding(padding: number): PackLayout<T>;
    (root: HierarchyNode<T>): HierarchyNode<T>;
  }

  export function pack<T extends HierarchyDatum = HierarchyDatum>(): PackLayout<T>;

  export function scaleOrdinal<Input = string, Output = string>(
    range: readonly Output[],
  ): (value: Input) => Output;

  export const schemeTableau10: readonly string[];
}
