import type { Course } from '@workspace/api-client-react';

export const taskCoursePresets = [
  { code: 'ENT 3503', name: 'Social Entrepreneurship', color: '#278476' },
  { code: 'ENT 3273', name: 'Foundational Startup Skills', color: '#e88724' },
  { code: 'ENT 3243', name: 'Promoting New Ventures', color: '#6863aa' },
  { code: 'ENT 3603', name: 'Rapid Software Prototype', color: '#397fa4' },
] as const;

export const normalizeTaskCourseCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();
export const presetCourseValue = (code: string) => `preset:${code}`;

export function taskCourseChoices(courses: Course[]) {
  const matchedIds = new Set<number>();
  const choices = taskCoursePresets.map(preset => {
    const existing = courses.find(course =>
      normalizeTaskCourseCode(course.code) === normalizeTaskCourseCode(preset.code));
    if (existing) matchedIds.add(existing.id);
    return { value: existing ? String(existing.id) : presetCourseValue(preset.code), code: preset.code, name: preset.name };
  });
  return [
    ...choices,
    ...courses.filter(course => !matchedIds.has(course.id))
      .map(course => ({ value: String(course.id), code: course.code, name: course.name })),
  ];
}