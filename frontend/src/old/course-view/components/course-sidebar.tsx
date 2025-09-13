import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarRail,
  SidebarFooter,
} from "@/components/atoms/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/atoms/collapsible";
import {
  ChevronRight,
  Book,
  Layers,
  Video,
  FileText,
  ListChecks,
} from "lucide-react";
import { WebCamView } from "./camera-view";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";
// ---------------------------------------------
// Data Types
// ---------------------------------------------
export interface ItemData {
  name: string;
  type: "video" | "blog" | "quiz";
  itemId: string;
}

export interface SectionData {
  name: string;
  description: string;
  sectionId: string;
  items: ItemData[];
}

export interface ModuleData {
  name: string;
  description: string;
  moduleId: string;
  sections: SectionData[];
}

export interface CourseData {
  name: string;
  description: string;
  version: string;
  courseId: string;
  courseVersionId: string;
  modules: ModuleData[];
}


function SidebarLabel({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span gets truncate behaviour */}
          <span className="truncate whitespace-nowrap">{label}</span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs break-words">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


// ---------------------------------------------
// Utility for choosing an icon based on type
// ---------------------------------------------
function getItemIcon(type: ItemData["type"]) {
  switch (type) {
    case "video":
      return <Video />;
    case "quiz":
      return <ListChecks />;
    case "blog":
    default:
      return <FileText />;
  }
}

// ---------------------------------------------
// Tree Nodes (Recursive)
// ---------------------------------------------
interface ItemNodeProps {
  item: ItemData;
  activeItemId?: string;
  onItemSelect?: (item: ItemData) => void;
}

function ItemNode({ item, activeItemId, onItemSelect }: ItemNodeProps) {
  const isActive = activeItemId === item.itemId;
  return (
    <SidebarMenuButton
      isActive={isActive}
      className="data-[active=true]:bg-transparent"
      onClick={() => onItemSelect?.(item)}
    >
      {getItemIcon(item.type)}
      <SidebarLabel label={item.name} />
    </SidebarMenuButton>
  );
}

interface SectionNodeProps {
  section: SectionData;
  activeItemId?: string;
  onItemSelect?: (item: ItemData) => void;
  defaultOpen?: boolean;
}

function SectionNode({
  section,
  activeItemId,
  onItemSelect,
  defaultOpen,
}: SectionNodeProps) {
  return (
    <SidebarMenuItem>
      <Collapsible
        defaultOpen={defaultOpen}
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Layers />
            <SidebarLabel label={section.name} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {section.items.map((item) => (
              <ItemNode
                key={item.itemId}
                item={item}
                activeItemId={activeItemId}
                onItemSelect={onItemSelect}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

interface ModuleNodeProps {
  module: ModuleData;
  activeItemId?: string;
  onItemSelect?: (item: ItemData) => void;
  defaultOpen?: boolean;
}

function ModuleNode({
  module,
  activeItemId,
  onItemSelect,
  defaultOpen,
}: ModuleNodeProps) {
  return (
    <SidebarMenuItem>
      <Collapsible
        defaultOpen={defaultOpen}
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Book />
            <SidebarLabel label={module.name} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {module.sections.map((section) => (
              <SectionNode
                key={section.sectionId}
                section={section}
                activeItemId={activeItemId}
                onItemSelect={onItemSelect}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

// ---------------------------------------------
// Public Component: CourseSidebar
// ---------------------------------------------
export interface CourseSidebarProps
  extends React.ComponentProps<typeof Sidebar> {
  course: CourseData;
  activeItemId?: string;
  onItemSelect?: (item: ItemData) => void;
}

export function CourseSidebar({
  course,
  activeItemId,
  onItemSelect,
  ...sidebarProps
}: CourseSidebarProps) {
  return (
    <Sidebar variant="inset"{...sidebarProps}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{course.name}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {course.modules.map((module) => (
                <ModuleNode
                  key={module.moduleId}
                  module={module}
                  activeItemId={activeItemId}
                  onItemSelect={onItemSelect}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ───────────── FOOTER W/ WEBCAM ──────────── */}
      <SidebarFooter>
        <div className="p-1">
          {/* You can pass live values from your proctoring service here */}
          <WebCamView
            faces={1}
            isBlur={false}
            isFocused={true}
            isRecording={true}
          />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
