import { create } from 'zustand'

const useStore = create((set) => ({
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  selectedCourse: null,
  setSelectedCourse: (course) => set({ selectedCourse: course }),
}))

export default useStore