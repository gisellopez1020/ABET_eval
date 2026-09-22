import { create } from 'zustand';

interface CourseStore {
  selectedCourseId: number | null;
  setSelectedCourse: (courseId: number) => void;
  clearSelectedCourse: () => void;
}

export const useCourseStore = create<CourseStore>((set) => ({
  selectedCourseId: null,

  setSelectedCourse: (courseId) => {
    set({ selectedCourseId: courseId });
  },

  clearSelectedCourse: () => {
    set({ selectedCourseId: null });
  },
}));