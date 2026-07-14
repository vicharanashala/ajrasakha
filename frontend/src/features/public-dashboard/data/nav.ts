/** Header navigation + the section ids the scroll-spy watches. */
export interface NavItem {
  id: string;
  label: string;
}

export const NAV: NavItem[] = [
  { id: "about", label: "Overview" },
  { id: "layer1", label: "Snapshot" },
  { id: "layer2", label: "Coverage Map" },
  { id: "layer3", label: "Knowledge Engine" },
  { id: "layer4", label: "Expert Network" },
  { id: "layer5", label: "Integrations" },
  { id: "layer6", label: "Impact" },
];
