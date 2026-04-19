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
}
