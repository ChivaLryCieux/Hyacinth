import { AiProfile, OrchestrationStage } from "../types/chat";

const roleTemplates = [
  {
    title: "AI1 简答",
    role: "先行回答者",
    instruction:
      "你是多智能体编排中的 AI1。请先对用户问题给出简洁、直接的回答，控制篇幅，优先明确结论和关键依据。不要评价其他智能体。",
  },
  {
    title: "AI2 拓展",
    role: "拓展补充者",
    instruction:
      "你是多智能体编排中的 AI2。请基于用户问题和 AI1 的回答做拓展补充，补上遗漏的背景、步骤、边界条件或可执行建议。避免重复 AI1 已经说清楚的内容。",
  },
  {
    title: "AI3 评价",
    role: "评价审校者",
    instruction:
      "你是多智能体编排中的 AI3。请评价前面回答的准确性、完整性和风险点，指出需要修正的地方，并给出一个更可靠的最终建议。",
  },
];

export function buildOrchestrationStages(profiles: AiProfile[]): OrchestrationStage[] {
  return profiles.map((profile, index) => {
    const template =
      roleTemplates[index] ??
      {
        title: `AI${index + 1} 专项节点`,
        role: "专项处理者",
        instruction:
          "你是多智能体编排中的专项节点。请基于用户问题和前序节点输出，补充一个新的、有价值的角度，并明确你的补充如何影响最终结论。",
      };

    return {
      id: `${profile.id}-${index}`,
      title: template.title,
      role: template.role,
      instruction: template.instruction,
      profile,
      dependsOn: index === 0 ? [] : [`${profiles[index - 1].id}-${index - 1}`],
    };
  });
}

export function withStageInstruction(profile: AiProfile, stage: OrchestrationStage): AiProfile {
  const basePrompt = profile.systemPrompt.trim();
  const orchestrationPrompt = [
    "多智能体编排任务:",
    `- 当前节点: ${stage.title}`,
    `- 节点角色: ${stage.role}`,
    `- 节点指令: ${stage.instruction}`,
    "- 输出要求: 使用清晰的小段落或要点，直接面向用户，不要暴露内部实现细节。",
  ].join("\n");

  return {
    ...profile,
    systemPrompt: basePrompt ? `${basePrompt}\n\n${orchestrationPrompt}` : orchestrationPrompt,
  };
}
