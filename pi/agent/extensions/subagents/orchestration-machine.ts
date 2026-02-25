import { assign, createActor, createMachine } from "xstate";

export interface OrchestrationStageDefinition {
  label: string;
  total: number;
}

export interface OrchestrationStageProgress {
  index: number;
  label: string;
  total: number;
  done: number;
  running: number;
  failed: number;
}

type OrchestrationStateValue = "idle" | "running" | "failed" | "done";

interface OrchestrationStateContext {
  stages: OrchestrationStageProgress[];
  currentStage: number;
  previousOutput: string;
  error?: string;
}

type OrchestrationStateEvent =
  | { type: "START" }
  | { type: "STAGE_STARTED"; stageIndex: number }
  | { type: "STAGE_PROGRESS"; stageIndex: number; done: number; running: number; failed: number }
  | { type: "STAGE_COMPLETED"; stageIndex: number; previousOutput: string }
  | { type: "STAGE_FAILED"; stageIndex: number; error: string }
  | { type: "COMPLETE" };

export interface OrchestrationRuntimeState {
  state: OrchestrationStateValue;
  stages: OrchestrationStageProgress[];
  currentStage: number;
  previousOutput: string;
  error?: string;
}

export interface OrchestrationStateEngine {
  start(): void;
  stop(): void;
  send(event: OrchestrationStateEvent): void;
  getState(): OrchestrationRuntimeState;
}

function toStateValue(value: unknown): OrchestrationStateValue {
  if (value === "idle" || value === "running" || value === "failed" || value === "done") {
    return value;
  }
  return "running";
}

const orchestrationStateMachine = createMachine({
  types: {} as {
    context: OrchestrationStateContext;
    events: OrchestrationStateEvent;
    input: { stages: OrchestrationStageDefinition[] };
  },
  id: "subagent-orchestration",
  initial: "idle",
  context: ({ input }) => ({
    stages: input.stages.map((stage, index) => ({
      index,
      label: stage.label,
      total: stage.total,
      done: 0,
      running: 0,
      failed: 0,
    })),
    currentStage: 0,
    previousOutput: "",
    error: undefined,
  }),
  states: {
    idle: {
      on: {
        START: {
          target: "running",
        },
      },
    },
    running: {
      on: {
        STAGE_STARTED: {
          actions: assign(({ context, event }) => {
            if (event.type !== "STAGE_STARTED") return {};

            const stage = context.stages[event.stageIndex];
            if (!stage) return {};

            const stages = [...context.stages];
            stages[event.stageIndex] = {
              ...stage,
              done: 0,
              running: stage.total,
              failed: 0,
            };

            return {
              stages,
              currentStage: event.stageIndex,
              error: undefined,
            };
          }),
        },
        STAGE_PROGRESS: {
          actions: assign(({ context, event }) => {
            if (event.type !== "STAGE_PROGRESS") return {};

            const stage = context.stages[event.stageIndex];
            if (!stage) return {};

            const stages = [...context.stages];
            stages[event.stageIndex] = {
              ...stage,
              done: event.done,
              running: event.running,
              failed: event.failed,
            };

            return {
              stages,
              currentStage: event.stageIndex,
            };
          }),
        },
        STAGE_COMPLETED: {
          actions: assign(({ context, event }) => {
            if (event.type !== "STAGE_COMPLETED") return {};

            const stage = context.stages[event.stageIndex];
            if (!stage) return { previousOutput: event.previousOutput };

            const stages = [...context.stages];
            stages[event.stageIndex] = {
              ...stage,
              done: stage.total,
              running: 0,
            };

            return {
              stages,
              currentStage: Math.min(event.stageIndex + 1, Math.max(context.stages.length - 1, 0)),
              previousOutput: event.previousOutput,
            };
          }),
        },
        STAGE_FAILED: {
          target: "failed",
          actions: assign(({ context, event }) => {
            if (event.type !== "STAGE_FAILED") return {};

            const stage = context.stages[event.stageIndex];
            if (!stage) {
              return {
                currentStage: event.stageIndex,
                error: event.error,
              };
            }

            const stages = [...context.stages];
            stages[event.stageIndex] = {
              ...stage,
              running: 0,
              failed: Math.max(1, stage.failed),
            };

            return {
              stages,
              currentStage: event.stageIndex,
              error: event.error,
            };
          }),
        },
        COMPLETE: {
          target: "done",
        },
      },
    },
    failed: {
      type: "final",
    },
    done: {
      type: "final",
    },
  },
});

export function createOrchestrationStateEngine(stages: OrchestrationStageDefinition[]): OrchestrationStateEngine {
  const actor = createActor(orchestrationStateMachine, {
    input: { stages },
  });

  return {
    start() {
      actor.start();
    },
    stop() {
      actor.stop();
    },
    send(event) {
      actor.send(event);
    },
    getState() {
      const snapshot = actor.getSnapshot();
      return {
        state: toStateValue(snapshot.value),
        stages: snapshot.context.stages.map((stage) => ({ ...stage })),
        currentStage: snapshot.context.currentStage,
        previousOutput: snapshot.context.previousOutput,
        error: snapshot.context.error,
      };
    },
  };
}
