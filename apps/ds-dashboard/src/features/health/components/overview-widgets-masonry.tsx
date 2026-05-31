import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export interface OverviewWidget {
  id: string;
  estimatedHeight: number;
  render: () => ReactNode;
}

const COLUMN_GAP_PX = 16;
const MIN_COLUMN_WIDTH_PX = 320;
const MAX_COLUMN_COUNT = 4;
const ESTIMATED_HEIGHT_UNIT_PX = 160;

const GRID_CLASS_BY_COLUMN_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

function getColumnCount(width: number, widgetCount: number): number {
  if (widgetCount <= 0) return 1;
  if (width <= 0) return 1;

  return Math.max(
    1,
    Math.min(
      MAX_COLUMN_COUNT,
      widgetCount,
      Math.floor((width + COLUMN_GAP_PX) / (MIN_COLUMN_WIDTH_PX + COLUMN_GAP_PX)),
    ),
  );
}

function getWidgetHeight(widget: OverviewWidget, measuredHeights: Map<string, number>): number {
  return measuredHeights.get(widget.id) ?? widget.estimatedHeight * ESTIMATED_HEIGHT_UNIT_PX;
}

function buildMeasuredColumns(
  widgets: OverviewWidget[],
  columnCount: number,
  measuredHeights: Map<string, number>,
): OverviewWidget[][] {
  const columns = Array.from({ length: columnCount }, () => ({
    height: 0,
    widgets: [] as OverviewWidget[],
  }));
  const sortedWidgets = [...widgets].sort((left, right) => {
    const heightComparison = getWidgetHeight(right, measuredHeights) - getWidgetHeight(left, measuredHeights);
    if (heightComparison !== 0) return heightComparison;
    return widgets.indexOf(left) - widgets.indexOf(right);
  });

  for (const widget of sortedWidgets) {
    const shortestColumn = columns.reduce((shortest, column) => (
      column.height < shortest.height ? column : shortest
    ));
    shortestColumn.widgets.push(widget);
    shortestColumn.height += getWidgetHeight(widget, measuredHeights) + COLUMN_GAP_PX;
  }

  return columns.map((column) => column.widgets);
}

export function OverviewWidgetsMasonry({ widgets }: { widgets: OverviewWidget[] }) {
  const containerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [columnCount, setColumnCount] = useState(1);
  const [measuredHeights, setMeasuredHeights] = useState(() => new Map<string, number>());

  const measureItems = useCallback(() => {
    setMeasuredHeights((current) => {
      let hasChanged = false;
      const next = new Map(current);

      for (const widget of widgets) {
        const element = itemRefs.current.get(widget.id);
        if (!element) continue;

        const height = element.getBoundingClientRect().height;
        const roundedHeight = Math.round(height);
        if (roundedHeight > 0 && next.get(widget.id) !== roundedHeight) {
          next.set(widget.id, roundedHeight);
          hasChanged = true;
        }
      }

      return hasChanged ? next : current;
    });
  }, [widgets]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateColumnCount = () => {
      setColumnCount(getColumnCount(container.getBoundingClientRect().width, widgets.length));
    };
    updateColumnCount();
    measureItems();

    const resizeObserver = new ResizeObserver(() => {
      updateColumnCount();
      measureItems();
    });
    resizeObserverRef.current = resizeObserver;
    resizeObserver.observe(container);
    for (const element of itemRefs.current.values()) {
      resizeObserver.observe(element);
    }

    return () => {
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
    };
  }, [measureItems, widgets.length]);

  const columns = useMemo(
    () => buildMeasuredColumns(widgets, columnCount, measuredHeights),
    [columnCount, measuredHeights, widgets],
  );

  const setItemRef = useCallback((widgetId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(widgetId, element);
      resizeObserverRef.current?.observe(element);
      return;
    }
    const previousElement = itemRefs.current.get(widgetId);
    if (previousElement) {
      resizeObserverRef.current?.unobserve(previousElement);
      itemRefs.current.delete(widgetId);
    }
  }, []);

  return (
    <section
      ref={containerRef}
      className={cn("grid gap-4", GRID_CLASS_BY_COLUMN_COUNT[columnCount] ?? "grid-cols-1")}
    >
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="flex min-w-0 flex-col gap-4">
          {column.map((widget) => (
            <div key={widget.id} ref={setItemRef(widget.id)}>
              {widget.render()}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
