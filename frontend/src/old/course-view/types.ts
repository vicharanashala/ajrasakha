interface ItemData {
  name: string;
  type: "video" | "blog" | "quiz";
  itemId: string;
}

interface SectionData {
  name: string;
  description: string;
  sectionId: string;
  items: ItemData[];
}

interface ModuleData {
  name: string;
  description: string;
  moduleId: string;
  sections: SectionData[];
}

interface CourseData {
  name: string;
  description: string;
  version: string;
  courseId: string;
  courseVersionId: string;
  modules: ModuleData[];
}
