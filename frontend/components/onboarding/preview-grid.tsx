import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { createYearGrid, WEEKDAY_LABELS } from '@/lib/date';
import { fonts, moodScale, radii, spacing, type AppPalette } from '@/lib/theme';

const PREVIEW_SCROLL_BUFFER_COLUMNS = 3;
const PREVIEW_CELL_SIZE = 12;
const PREVIEW_CELL_GAP = 4;
const PREVIEW_FILL_START_DELAY_MS = 58;
const PREVIEW_FILL_END_DELAY_MS = 22;
const PREVIEW_TIMING_VARIANCE_MIN = 0.1;
const PREVIEW_TIMING_VARIANCE_MAX = 0.2;
const PREVIEW_DELAY_SMOOTHING = 0.28;
const PREVIEW_PAN_LERP_FACTOR = 0.2;
const PREVIEW_PAN_SNAP_THRESHOLD_PX = 0.2;

function getPreviewFillDelayMs(progressRatio: number, previousDelayMs: number) {
  const normalizedProgress = Math.max(0, Math.min(1, progressRatio));
  const trendDelay =
    PREVIEW_FILL_START_DELAY_MS -
    (PREVIEW_FILL_START_DELAY_MS - PREVIEW_FILL_END_DELAY_MS) * normalizedProgress;
  const jitterRatio =
    PREVIEW_TIMING_VARIANCE_MIN +
    Math.random() * (PREVIEW_TIMING_VARIANCE_MAX - PREVIEW_TIMING_VARIANCE_MIN);
  const jitterDirection = Math.random() > 0.5 ? 1 : -1;
  const jitteredDelay = trendDelay * (1 + jitterRatio * jitterDirection);
  const clampedDelay = Math.max(
    PREVIEW_FILL_END_DELAY_MS * 0.9,
    Math.min(PREVIEW_FILL_START_DELAY_MS * 1.15, jitteredDelay),
  );
  const smoothedDelay = previousDelayMs + (clampedDelay - previousDelayMs) * PREVIEW_DELAY_SMOOTHING;
  return Math.round(smoothedDelay);
}

type PreviewGridProps = {
  active: boolean;
  animationCompleted: boolean;
  onAnimationComplete: () => void;
  palette: AppPalette;
};

const PreviewGrid = memo(function PreviewGrid({
  active,
  animationCompleted,
  onAnimationComplete,
  palette,
}: PreviewGridProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const previewYear = useMemo(() => new Date().getFullYear(), []);
  const previewNow = useMemo(() => new Date(previewYear, 11, 31), [previewYear]);
  const { weeks, monthLabels } = useMemo(() => createYearGrid(previewYear, previewNow), [previewNow, previewYear]);
  const daySequence = useMemo(
    () =>
      weeks.flatMap((week) =>
        week.flatMap((cell) => {
          if (!cell) {
            return [];
          }
          return [cell.dateKey];
        }),
      ),
    [weeks],
  );
  const dayIndexByDateKey = useMemo(() => {
    const map: Record<string, number> = {};
    daySequence.forEach((dateKey, index) => {
      map[dateKey] = index;
    });
    return map;
  }, [daySequence]);
  const columnProgressByDateKey = useMemo(() => {
    const map: Record<string, number> = {};
    weeks.forEach((week, weekIndex) => {
      week.forEach((cell, dayIndex) => {
        if (!cell) {
          return;
        }
        map[cell.dateKey] = weekIndex + dayIndex / 7;
      });
    });
    return map;
  }, [weeks]);
  const previewMoodByDate = useMemo(() => {
    const moodColors = moodScale.map((mood) => mood.color);
    const map: Record<string, string> = {};
    daySequence.forEach((dateKey, index) => {
      const colorIndex = (index * 11 + Math.floor(index / 5)) % moodColors.length;
      map[dateKey] = moodColors[colorIndex];
    });
    return map;
  }, [daySequence]);

  const totalDays = daySequence.length;
  const [filledDays, setFilledDays] = useState(() => (animationCompleted ? totalDays : 0));
  const [viewportWidth, setViewportWidth] = useState(0);
  const columnStride = PREVIEW_CELL_SIZE + PREVIEW_CELL_GAP;
  const visibleColumns = useMemo(() => {
    if (viewportWidth <= 0) {
      return 12;
    }
    const fitColumns = Math.floor(viewportWidth / columnStride);
    return Math.max(6, Math.min(weeks.length, fitColumns));
  }, [columnStride, viewportWidth, weeks.length]);
  const maxStartWeekIndex = Math.max(0, weeks.length - visibleColumns);
  const initialCompletedStart = animationCompleted ? maxStartWeekIndex : 0;
  const initialHorizontalOffset = -initialCompletedStart * columnStride;
  const horizontalOffset = useRef(new Animated.Value(initialHorizontalOffset)).current;
  const currentHorizontalOffsetRef = useRef(initialHorizontalOffset);
  const completionNotified = useRef(animationCompleted);
  const fillProgressRef = useRef(animationCompleted ? totalDays : 0);
  const lastFillDelayRef = useRef(PREVIEW_FILL_START_DELAY_MS);
  const fillPhaseStartValueRef = useRef(fillProgressRef.current);
  const fillPhaseStartTimeRef = useRef(Date.now());
  const fillPhaseDurationMsRef = useRef(0);
  const columnProgressByDayIndex = useMemo(
    () => daySequence.map((dateKey) => columnProgressByDateKey[dateKey] ?? 0),
    [columnProgressByDateKey, daySequence],
  );

  useEffect(() => {
    if (!animationCompleted) {
      return;
    }
    fillProgressRef.current = totalDays;
    lastFillDelayRef.current = PREVIEW_FILL_END_DELAY_MS;
    fillPhaseStartValueRef.current = totalDays;
    fillPhaseStartTimeRef.current = Date.now();
    fillPhaseDurationMsRef.current = 0;
    setFilledDays(totalDays);
    const completedOffset = -maxStartWeekIndex * columnStride;
    currentHorizontalOffsetRef.current = completedOffset;
    horizontalOffset.setValue(completedOffset);
    completionNotified.current = true;
  }, [animationCompleted, columnStride, horizontalOffset, maxStartWeekIndex, totalDays]);

  useEffect(() => {
    if (!active || animationCompleted) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    lastFillDelayRef.current = PREVIEW_FILL_START_DELAY_MS;
    fillPhaseStartValueRef.current = fillProgressRef.current;
    fillPhaseStartTimeRef.current = Date.now();
    fillPhaseDurationMsRef.current = 0;

    const scheduleNextFill = () => {
      const delay = getPreviewFillDelayMs(
        fillProgressRef.current / Math.max(totalDays, 1),
        lastFillDelayRef.current,
      );
      lastFillDelayRef.current = delay;
      fillPhaseStartValueRef.current = fillProgressRef.current;
      fillPhaseStartTimeRef.current = Date.now();
      fillPhaseDurationMsRef.current = delay;
      timeoutId = setTimeout(() => {
        if (cancelled) {
          return;
        }

        const currentValue = fillProgressRef.current;
        if (currentValue >= totalDays) {
          return;
        }

        const nextValue = currentValue + 1;
        fillProgressRef.current = nextValue;
        setFilledDays(nextValue);

        if (nextValue >= totalDays) {
          if (!completionNotified.current) {
            completionNotified.current = true;
            onAnimationComplete();
          }
          return;
        }

        scheduleNextFill();
      }, delay);
    };

    scheduleNextFill();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [active, animationCompleted, onAnimationComplete, totalDays]);

  useEffect(() => {
    if (!active || animationCompleted) {
      return;
    }

    let cancelled = false;
    let frameId = 0;

    const tick = () => {
      if (cancelled) {
        return;
      }

      const lockColumnIndex = Math.max(0, visibleColumns - PREVIEW_SCROLL_BUFFER_COLUMNS);
      let target = -maxStartWeekIndex * columnStride;

      if (fillProgressRef.current < totalDays) {
        const phaseDurationMs = fillPhaseDurationMsRef.current;
        const phaseElapsedMs = Math.max(0, Date.now() - fillPhaseStartTimeRef.current);
        const phaseRatio = phaseDurationMs > 0 ? Math.min(1, phaseElapsedMs / phaseDurationMs) : 0;
        const interpolatedFillValue = fillPhaseStartValueRef.current + phaseRatio;
        const dayFloatIndex = Math.max(0, Math.min(totalDays - 1, interpolatedFillValue - 1));
        const lowIndex = Math.floor(dayFloatIndex);
        const highIndex = Math.min(totalDays - 1, lowIndex + 1);
        const blend = dayFloatIndex - lowIndex;
        const lowColumn = columnProgressByDayIndex[lowIndex] ?? 0;
        const highColumn = columnProgressByDayIndex[highIndex] ?? lowColumn;
        const interpolatedColumn = lowColumn + (highColumn - lowColumn) * blend;
        const nextStartPosition = Math.max(0, Math.min(maxStartWeekIndex, interpolatedColumn - lockColumnIndex));
        target = -nextStartPosition * columnStride;
      }

      const current = currentHorizontalOffsetRef.current;
      const delta = target - current;

      if (Math.abs(delta) <= PREVIEW_PAN_SNAP_THRESHOLD_PX) {
        if (current !== target) {
          currentHorizontalOffsetRef.current = target;
          horizontalOffset.setValue(target);
        }
      } else {
        const next = current + delta * PREVIEW_PAN_LERP_FACTOR;
        currentHorizontalOffsetRef.current = next;
        horizontalOffset.setValue(next);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    active,
    animationCompleted,
    columnProgressByDayIndex,
    columnStride,
    horizontalOffset,
    maxStartWeekIndex,
    totalDays,
    visibleColumns,
  ]);

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewCalendar}>
        <View style={[styles.previewWeekdayRail, { gap: PREVIEW_CELL_GAP }]}>
          {WEEKDAY_LABELS.map((label, index) => (
            <Text key={`${label}-${index}`} style={styles.previewWeekdayLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View
          onLayout={(event) => {
            const measuredWidth = Math.floor(event.nativeEvent.layout.width);
            setViewportWidth((current) => (current === measuredWidth ? current : measuredWidth));
          }}
          style={styles.previewGridViewport}>
          <Animated.View
            style={[
              styles.previewScrollableContent,
              {
                transform: [{ translateX: horizontalOffset }],
              },
            ]}>
            <View style={[styles.previewMonthRow, { marginBottom: PREVIEW_CELL_GAP }]}>
              {weeks.map((_, weekIndex) => (
                <View
                  key={`preview-month-${weekIndex}`}
                  style={[styles.previewMonthSlot, { marginRight: PREVIEW_CELL_GAP }]}>
                  <Text style={styles.previewMonthText}>{monthLabels[weekIndex] ?? ''}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.previewWeekRow, { gap: PREVIEW_CELL_GAP }]}>
              {weeks.map((week, weekIndex) => (
                <View key={`preview-week-${weekIndex}`} style={[styles.previewWeekColumn, { gap: PREVIEW_CELL_GAP }]}>
                  {week.map((cell, dayIndex) => {
                    if (!cell) {
                      return <View key={`preview-empty-${weekIndex}-${dayIndex}`} style={styles.previewEmptyCell} />;
                    }

                    const dayIndexInYear = dayIndexByDateKey[cell.dateKey] ?? Number.POSITIVE_INFINITY;
                    const isFilled = dayIndexInYear < filledDays;

                    return (
                      <View
                        key={cell.dateKey}
                        style={[
                          styles.previewCell,
                          {
                            backgroundColor: isFilled ? previewMoodByDate[cell.dateKey] : palette.futurePixel,
                            opacity: isFilled ? 1 : 0.5,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
});

export default PreviewGrid;

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    previewCard: {
      backgroundColor: palette.surface,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: palette.softStroke,
      padding: spacing.md,
      gap: spacing.sm,
    },
    previewCalendar: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    previewWeekdayRail: {
      width: 14,
      marginTop: 20,
    },
    previewWeekdayLabel: {
      height: PREVIEW_CELL_SIZE,
      fontFamily: fonts.body,
      fontSize: 9,
      color: palette.mutedText,
    },
    previewGridViewport: {
      flex: 1,
      overflow: 'hidden',
    },
    previewScrollableContent: {
      alignSelf: 'flex-start',
    },
    previewMonthRow: {
      flexDirection: 'row',
    },
    previewMonthSlot: {
      width: PREVIEW_CELL_SIZE,
      height: 14,
    },
    previewMonthText: {
      width: 26,
      fontFamily: fonts.body,
      fontSize: 9,
      color: palette.mutedText,
    },
    previewWeekRow: {
      flexDirection: 'row',
    },
    previewWeekColumn: {
      justifyContent: 'flex-start',
    },
    previewCell: {
      width: PREVIEW_CELL_SIZE,
      height: PREVIEW_CELL_SIZE,
      borderRadius: radii.xs,
      borderWidth: 1,
      borderColor: palette.softStroke,
    },
    previewEmptyCell: {
      width: PREVIEW_CELL_SIZE,
      height: PREVIEW_CELL_SIZE,
    },
  });

export type { PreviewGridProps };
