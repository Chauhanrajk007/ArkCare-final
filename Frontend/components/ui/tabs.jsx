"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = ({ className, ...props }) => <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props} />;
const TabsList = ({ className, ...props }) => <TabsPrimitive.List data-slot="tabs-list" className={cn("inline-flex h-9 w-fit items-center justify-center rounded-md border border-border bg-muted p-1 text-muted-foreground", className)} {...props} />;
const TabsTrigger = ({ className, ...props }) => <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn("inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-3 py-1 text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground", className)} {...props} />;
const TabsContent = ({ className, ...props }) => <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;

export { Tabs, TabsList, TabsTrigger, TabsContent };
