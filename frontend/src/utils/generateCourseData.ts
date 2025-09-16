// utils/generateCourseData.ts
// import { faker } from "@faker-js/faker";

// type Counts = { modules: number; sections: number; items: number };

// export function generateCourseData(
//   {
//     modules = 10,
//     sections = 5,
//     items = 40,
//   }: Partial<Counts> = {}
// ): CourseData {
//   const randomType = (): ItemData["type"] =>
//     faker.helpers.arrayElement(["video", "blog", "quiz"]);

//   return {
//     courseId: faker.string.uuid(),
//     courseVersionId: "1.0",
//     name: faker.company.catchPhrase(),           // e.g. “Foundations of …”
//     description: faker.lorem.paragraph(),
//     version: "1.0",
//     modules: Array.from({ length: modules }, (_, mi): ModuleData => ({
//       moduleId: `module-${mi + 1}`,
//       name: `Module ${mi + 1}: ${faker.word.adjective({ length: { min: 5, max: 10 } })}`,
//       description: faker.lorem.sentence(),
//       sections: Array.from({ length: sections }, (_, si): SectionData => ({
//         sectionId: `module-${mi + 1}-section-${si + 1}`,
//         name: `Section ${si + 1}: ${faker.hacker.noun()}`,
//         description: faker.lorem.sentence(),
//         items: Array.from({ length: items }, () => ({
//           itemId: faker.string.nanoid(),
//           name: faker.commerce.productName(),    // random title
//           type: randomType(),
//         })),
//       })),
//     })),
//   };
// }

/* ── usage ────────────────────────────────────────── */
// const course: CourseData = generateCourseData();
// console.log(course.modules[0].sections[0].items.length); // 40
