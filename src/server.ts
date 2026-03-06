import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest, callable} from "agents";
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
      system:`You are an AI video game recommendation assistant.

              Your job is to help users discover games based on:
              - genre
              - platform (PC, PlayStation, Xbox, Switch)
              - hardware performance (low-end or high-end)
              - player personality (competitive, relaxed, story-driven)

              When the user first asks for a recommendation, ask follow-up questions before suggesting games.

              Ask things like:
              - What platform do you play on?
              - Do you prefer competitive or relaxing games?
              - What type of performance does your PC have?

              Then provide personalized recommendations with short explanations for each game.

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

      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
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
