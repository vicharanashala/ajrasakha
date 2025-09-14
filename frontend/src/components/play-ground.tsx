import { LogOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/atoms/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import { Textarea } from "@/components/atoms/textarea";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import { TopPSelector } from "@/components/atoms/top-p-selector";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/atoms/hover-card";
import { CodeViewer } from "@/components/atoms/code-viewer";
import { PresetSelector } from "@/components/atoms/preset-selector";
import { PresetSave } from "@/components/atoms/preset-save";
import { PresetShare } from "@/components/atoms/preset-share";
import { UserProfileActions } from "@/components/atoms/preset-actions";
import { ModelSelector } from "@/components/atoms/model-selector";
import { TemperatureSelector } from "@/components/atoms/temperature-selector";
import { MaxLengthSelector } from "@/components/atoms/maxlength-selector";
import { models, types } from "@/utils/model";
import { presets } from "@/utils/presets";
import QAInterface from "./QA-interface";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { LogoutButton } from "./atoms/logout-button";
import { useAuthStore } from "@/stores/authStore";

export const PlaygroundPage = () => {
  const { logout } = useAuthStore();
  return (
    <>
      <div className="md:hidden">
        <img
          src="/examples/playground-light.png"
          width={1280}
          height={916}
          alt="Playground"
          className="block dark:hidden"
        />
        <img
          src="/examples/playground-dark.png"
          width={1280}
          height={916}
          alt="Playground"
          className="hidden dark:block"
        />
      </div>
      <div className="hidden h-full flex-col md:flex ">
        <div className="container flex flex-col items-start justify-between space-y-2 py-4 sm:flex-row sm:items-center sm:space-y-0 md:h-16">
          <img src="/annam-logo.png" alt="Annam Logo" className="h-18 w-auto" />
          <div className="ml-auto flex w-full space-x-2 sm:justify-end">
            {/* <PresetSelector presets={presets} />
            <PresetSave />
            <div className="hidden space-x-2 md:flex">
              <CodeViewer />
              <PresetShare />
            </div> */}
            {/* <LogoutButton onLogout={logout} /> */}
            <ThemeToggleCompact />
            <UserProfileActions />
          </div>
        </div>
        <Separator />
        <Tabs defaultValue="complete" className="flex-1">
          <div className="container h-full py-6">
            <div className="grid h-full items-stretch gap-6 md:grid-cols-[1fr_200px]">
              <div className="hidden flex-col space-y-4 sm:flex md:order-2">
                <div className="grid gap-2">
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Mode
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-[320px] text-sm" side="left">
                      Choose the interface that best suits your task. You can
                      provide: a simple prompt to complete, starting and ending
                      text to insert a completion within, or some text with
                      instructions to edit it.
                    </HoverCardContent>
                  </HoverCard>
                  <TabsList className="grid grid-cols-3">
                    <TabsTrigger value="complete">
                      <span className="sr-only">Complete</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-5 w-5"
                      >
                        <rect
                          x="4"
                          y="3"
                          width="12"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="4"
                          y="7"
                          width="12"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="4"
                          y="11"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="4"
                          y="15"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="8.5"
                          y="11"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="8.5"
                          y="15"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="13"
                          y="11"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                      </svg>
                    </TabsTrigger>
                    <TabsTrigger value="insert">
                      <span className="sr-only">Insert</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-5 w-5"
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M14.491 7.769a.888.888 0 0 1 .287.648.888.888 0 0 1-.287.648l-3.916 3.667a1.013 1.013 0 0 1-.692.268c-.26 0-.509-.097-.692-.268L5.275 9.065A.886.886 0 0 1 5 8.42a.889.889 0 0 1 .287-.64c.181-.17.427-.267.683-.269.257-.002.504.09.69.258L8.903 9.87V3.917c0-.243.103-.477.287-.649.183-.171.432-.268.692-.268.26 0 .509.097.692.268a.888.888 0 0 1 .287.649V9.87l2.245-2.102c.183-.172.432-.269.692-.269.26 0 .508.097.692.269Z"
                          fill="currentColor"
                        ></path>
                        <rect
                          x="4"
                          y="15"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="8.5"
                          y="15"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="13"
                          y="15"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                      </svg>
                    </TabsTrigger>
                    <TabsTrigger value="edit">
                      <span className="sr-only">Edit</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-5 w-5"
                      >
                        <rect
                          x="4"
                          y="3"
                          width="12"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="4"
                          y="7"
                          width="12"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="4"
                          y="11"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="4"
                          y="15"
                          width="4"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <rect
                          x="8.5"
                          y="11"
                          width="3"
                          height="2"
                          rx="1"
                          fill="currentColor"
                        ></rect>
                        <path
                          d="M17.154 11.346a1.182 1.182 0 0 0-1.671 0L11 15.829V17.5h1.671l4.483-4.483a1.182 1.182 0 0 0 0-1.671Z"
                          fill="currentColor"
                        ></path>
                      </svg>
                    </TabsTrigger>
                  </TabsList>
                </div>
                <ModelSelector types={types} models={models} />
                <TemperatureSelector defaultValue={[0.56]} />
                <MaxLengthSelector defaultValue={[256]} />
                <TopPSelector defaultValue={[0.9]} />
              </div>
              <div className="md:order-1">
                <TabsContent value="complete" className="mt-0 border-0 p-0">
                  <div className="flex h-full flex-col space-y-4">
                    <Textarea
                      placeholder="Write a tagline for an ice cream shop"
                      className="min-h-[400px] flex-1 p-4 md:min-h-[700px] lg:min-h-[700px]"
                    />
                    <div className="flex items-center space-x-2">
                      <Button>Submit</Button>
                      <Button variant="secondary">
                        <span className="sr-only">Show history</span>
                        <RotateCcw />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="insert" className="mt-0 border-0 p-0">
                  <QAInterface />
                </TabsContent>
                <TabsContent value="edit" className="mt-0 border-0 p-0">
                  <div className="flex flex-col space-y-4">
                    <div className="grid h-full gap-6 lg:grid-cols-2">
                      <div className="flex flex-col space-y-4">
                        <div className="flex flex-1 flex-col space-y-2">
                          <Label htmlFor="input">Input</Label>
                          <Textarea
                            id="input"
                            placeholder="We is going to the market."
                            className="flex-1 lg:min-h-[580px]"
                          />
                        </div>
                        <div className="flex flex-col space-y-2">
                          <Label htmlFor="instructions">Instructions</Label>
                          <Textarea
                            id="instructions"
                            placeholder="Fix the grammar."
                          />
                        </div>
                      </div>
                      <div className="mt-[21px] min-h-[400px] rounded-md border bg-muted lg:min-h-[700px]" />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button>Submit</Button>
                      <Button variant="secondary">
                        <span className="sr-only">Show history</span>
                        <RotateCcw />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </>
  );
};
