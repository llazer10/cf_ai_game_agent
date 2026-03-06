import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest, callable, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs
} from "ai";
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env> {
  // Wait for MCP connections to restore after hibernation before processing messages
  waitForMcpConnections = true;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string, host: string) {
    return await this.addMcpServer(name, url, { callbackHost: host });
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are an AI video game recommendation assistant. Help users discover games based on genre, platform, and personal preferences. Provide engaging and personalized recommendations to enhance their gaming experience. Start by asking the user about their favorite game genres and platforms, their PC performance capability and their play style to recommend suitable games.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        getGameRecommendations: tool({
          description: "Recommend video games based on genre",
          inputSchema: z.object({
            genre: z.string(),
            platform: z.string().optional()
          }),
          execute: async ({ genre, platform }) => {
            return [
              { name: "Elden Ring", genre: "RPG", platform: "PC/Console" },
              { name: "Hades", genre: "Roguelike", platform: "PC/Switch" },
              { name: "Mario Party", genre: "Party", platform: "Switch" },
              { name: "Overwatch", genre: "FPS", platform: "PC/Console" },
              { name: "The Legend of Zelda", genre: "Adventure", platform: "Switch" },
              { name: "Job Simulator", genre: "Simulation", platform: "VR" }
            ];
          }
        }),

        gamePerformanceRecommendation: tool({
          description: "Recommend video games based on PC performance capability (low-end or high-end PCs).",
          inputSchema: z.object({
            performance: z.enum(["low", "high"])
        }),
        execute: async ({ performance }) => {

          if (performance === "low") {
            return {
              performance: "Low-end PC",
              games: [
                { name: "Stardew Valley", genre: "Farming / RPG" },
                { name: "Terraria", genre: "Sandbox Adventure" },
                { name: "Undertale", genre: "Story RPG" },
                { name: "Celeste", genre: "Platformer" },
                { name: "Hollow Knight", genre: "Metroidvania" }
              ]
            };
          }

          if (performance === "high") {
            return {
              performance: "High-end PC",
              games: [
                { name: "Cyberpunk 2077", genre: "Open World RPG" },
                { name: "Red Dead Redemption 2", genre: "Open World Adventure" },
                { name: "Elden Ring", genre: "Action RPG" },
                { name: "Microsoft Flight Simulator", genre: "Simulation" },
                { name: "Starfield", genre: "Sci-Fi RPG" }
              ]
            };
          }
        }
      }),

        personalityGameRecommendation: tool({
          description: "Recommend video games based on the player's personality and play style.",
          inputSchema: z.object({
            personality: z.enum([
              "competitive",
              "relaxed",
              "story_lover",
              "explorer",
              "strategist"
            ])
          }),

          execute: async ({ personality }) => {

            if (personality === "competitive") {
              return {
                personality: "Competitive player",
                games: [
                  "Valorant",
                  "Counter-Strike 2",
                  "Rocket League",
                  "Apex Legends"
                ]
              };
            }

            if (personality === "relaxed") {
              return {
                personality: "Relaxed / cozy player",
                games: [
                  "Stardew Valley",
                  "Animal Crossing",
                  "Spiritfarer",
                  "Unpacking"
                ]
              };
            }

            if (personality === "story_lover") {
              return {
                personality: "Story-driven player",
                games: [
                  "The Witcher 3",
                  "Life is Strange",
                  "Detroit: Become Human",
                  "Disco Elysium"
                ]
              };
            }

            if (personality === "explorer") {
              return {
                personality: "Explorer / open world fan",
                games: [
                  "Elden Ring",
                  "Breath of the Wild",
                  "Skyrim",
                  "No Man's Sky"
                ]
              };
            }

            if (personality === "strategist") {
              return {
                personality: "Strategic thinker",
                games: [
                  "Civilization VI",
                  "XCOM 2",
                  "Total War: Warhammer 3",
                  "Crusader Kings 3"
                ]
              };
            }
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description);
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
