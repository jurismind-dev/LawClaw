---
name: lawclaw-upgrade
summary: LawClaw 预设升级智能合并
---

# LawClaw Upgrade Skill

## 目标

基于三方上下文（`v_current`、`v_update`、`user_current`）产出可执行 JSON 合并结果，遵循“只加不破”的升级原则。

## 合并原则

1. 优先保留用户已有自定义表达与工作流。
2. 新版本新增能力与 `lawclaw-main` 相关配置应尽量补齐，禁止回写专业 agent 条目。
3. 遇到无法自动判断的冲突，返回 `decision = "need_confirmation"`。
4. 不要输出自然语言说明，必须只输出 JSON。

## 输出 JSON 协议（必须严格遵守）

```json
{
  "schemaVersion": 1,
  "decision": "apply",
  "reason": "可选，冲突或说明",
  "files": [
    {
      "key": "lawclaw-main:SOUL.md",
      "target": "SOUL.md",
      "content": "完整的新文件内容"
    }
  ],
  "configPatch": {}
}
```

### 字段约束

- `schemaVersion`: 固定为 `1`
- `decision`:
  - `apply`: 可直接应用
  - `need_confirmation`: 需要用户确认全局冲突策略
  - `skip`: 本次跳过
- `files`: 仅包含需要写入/更新的文件（完整内容，不是 diff）
- `configPatch`: 可选，JSON 对象；只包含增量补充项


