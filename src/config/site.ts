export const site = {
  name: "余像",
  english: "AFTERIMAGE",
  logo: "",
  subtitle: "A PERSONAL ARCHIVE OF THOUGHTS AND MOMENTS",
  intro: "日记、照片，与日常留下的余痕。",
  footer: "余像编辑部 · 演示档案",
  archive: "ARCHIVE NO. 0026",
  hero: { src: "media/shelves.jpg", alt: "深色木架上的一排排旧书", caption: "旧书架 · Ilya Semenov / 演示配图" },
  inset: { src: "media/coffee.jpg", alt: "暗处升起热气的杯子", caption: "咖啡 · Steve Harvey / 演示配图" },
  scan: "media/newsprint.jpg",
  about: { src: "media/books.jpg", alt: "旧书与纸页", caption: "纸页 · 演示配图" },
  headers: { photography: { src: "media/rain.jpg", alt: "雨夜里灯火映照街面", caption: "雨夜街道 · 演示配图" } } as Record<string, { src: string; alt: string; caption?: string }>,
};

export const sections = {
  journal: { title: "日记", label: "JOURNAL", deck: "A RECORD OF ORDINARY DAYS" },
  notes: { title: "碎碎念", label: "NOTES", deck: "UNFINISHED THOUGHTS" },
  culture: { title: "文化档案", label: "CULTURE", deck: "CINEMA / MUSIC / READING" },
  photography: { title: "摄影", label: "PHOTOGRAPHY", deck: "VISUAL DIARY" },
  about: { title: "关于", label: "ABOUT", deck: "PERSONAL ARCHIVE" },
};
export type Section = keyof typeof sections;
export const url = (path = "") => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
export const transitionId = (part: string, id: string) => `journal-${part}-${Array.from(id, c => c.codePointAt(0)?.toString(16)).join("-")}`;
