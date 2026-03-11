# OpenClaw Feishu/Lark Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@larksuiteoapi/feishu-openclaw-plugin.svg)](https://www.npmjs.com/package/@larksuiteoapi/feishu-openclaw-plugin)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-blue.svg)](https://nodejs.org/)

[中文版](./README.zh.md) | English

---

The official Feishu/Lark plugin for OpenClaw, developed and maintained by the Lark Open Platform team. It seamlessly connects your OpenClaw Agent to your Feishu/Lark workspace, empowering it to directly read from and write to messages, documents, sheets, calendars, tasks, and more.

## Features

This plugin provides comprehensive Feishu/Lark integration for OpenClaw, including:

| Category | Capabilities |
|----------|--------------|
| 💬 Messages | Message reading (group/DM history, topic replies), message sending, message replies, message search, image/file download |
| 📄 Docs | Create cloud docs, update cloud docs, read cloud doc content |
| 📊 Bitable | Create/manage bitables, data tables, fields, records (CRUD, batch operations, advanced filtering), views |
| 📅 Calendar | Calendar management, event management (create/query/update/delete/search), attendee management, free/busy lookup |
| ✅ Tasks | Task management (create/query/update/complete), tasklist management, subtasks, comments |

Additionally, the plugin supports:
- **📱 Interactive Cards**: Real-time status updates (thinking/streaming/complete states), confirmation buttons for sensitive operations
- **🌊 Streaming Replies**: Real-time streaming responses in message cards
- **🔒 Permission Policies**: Flexible access control policies for DMs and group chats
- **⚙️ Advanced Group Configuration**: Per-group settings including whitelists, skill bindings, and custom system prompts

For a complete list of features, please see [FEATURES.md](./openclaw/feishu/FEATURES.md).

## Important Security & Risk Warnings (Read Before Use)

**Core Risk:** This plugin connects to your workspace data through Feishu APIs — messages, documents, calendars, contacts. Anything the AI can read has the potential to be exposed. While we've implemented security measures, AI systems are not yet fully mature or stable, so we cannot guarantee absolute security.

**Strong Recommendation:** DO NOT use company/enterprise Feishu accounts at this stage! Please use personal accounts for testing and exploration only.

- This application is intended for personal use only and should NOT be shared with multiple users.
- Avoid using this plugin in group chats. Since it runs under your personal identity, other members may prompt it into accessing or sending your data, increasing the risk of data leakage.

**Other Operational Risks**
- AI is not perfect and may experience "hallucinations": It may sometimes misunderstand your intent or generate content that appears reasonable but is inaccurate.
- Some operations are irreversible: For example, messages sent by the AI on your behalf are sent in your name and become factual once sent.
- **Mitigation Advice:** For important operations involving sending, modifying, or writing data, please always **"preview first, then confirm"**. Never let the AI operate in a fully autonomous "self-driving" mode without human oversight.

**Disclaimer:** This plugin is provided "as is" without any warranties. Users are solely responsible for any data loss, security breaches, or other damages resulting from the use of this plugin. Please ensure you understand the risks before using this plugin.

## Requirements & Installation

Before you start, please ensure you have the following:

- **Node.js**: `v22` or higher.
- **OpenClaw**: A working installation of OpenClaw. For details, visit the [OpenClaw official website](https://openclaw.ai).

> **Note**: OpenClaw version must be **2026.2.26** or higher. Check with `openclaw -v`. If below this version, upgrade with:
> ```bash
> npm install -g openclaw
> ```

### Create Feishu Application

1. Log in to [Feishu Open Platform](https://open.feishu.cn/app), click "Create Enterprise Self-built App".
2. Configure app name, description, and icon, then click "Create".
3. Add Bot capability: In the left navigation, go to "App Capabilities > Add App Capability", select "Add by Capability" tab, click "Add" on the "Bot" capability card.
4. Import required permissions: In the left navigation, go to "Development Config > Permission Management", click "Batch Import/Export Permissions", and import the complete permission list.

> **Note**: Importing the complete permission list is very important for full functionality!

5. Publish and approve the app: Click "Create Version", configure version number and update notes, click "Save", then click "Confirm Publish".
6. Get app credentials: In the left navigation, go to "Basic Info > Credentials and Basic Info", get App ID and App Secret.

### Install Feishu Plugin

Execute the following commands in your terminal:

```bash
# Set npm registry
npm config set registry https://registry.npmjs.org

# Download plugin installer
curl -o /tmp/feishu-openclaw-plugin-onboard-cli.tgz https://sf3-cn.feishucdn.com/obj/open-platform-opendoc/4d184b1ba733bae2423a89e196a2ef8f_QATOjKH1WN.tgz

# Install plugin
npm install /tmp/feishu-openclaw-plugin-onboard-cli.tgz -g

# Clean up installer
rm /tmp/feishu-openclaw-plugin-onboard-cli.tgz

# Run installation wizard
feishu-plugin-onboard install
```

During installation:
- If you previously linked a Feishu app, you can choose to use the existing app or create a new one
- If no Feishu app is linked, enter the appId and appSecret created in the previous steps

Start the plugin:
```bash
openclaw gateway run
```

Verify success:
- After running the above command, if you see "started listening to Feishu events" in the logs, the plugin has started successfully
- Run `openclaw plugins list`, if **feishu-openclaw-plugin** Status is loaded and **feishu** Status is disabled, the plugin is successfully enabled

## Quick Start

1.  **Configure `openclaw.json`**

    After installation, edit your OpenClaw configuration file (`~/.openclaw/openclaw.json`) to enable the `feishu` channel and add your app credentials.

    Here is a minimal configuration example:

    ```json
    {
      "channels": {
        "feishu": {
          "enabled": true,
          "appId": "cli_xxxxxxxxxxxxxx",
          "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          "domain": "feishu",
          "connectionMode": "websocket"
        }
      },
      "plugins": {
        "allow": ["feishu-openclaw-plugin"]
      }
    }
    ```
    *Make sure to replace `appId` and `appSecret` with your own app credentials.*

2.  **Run the OpenClaw Gateway**

    Save the configuration and start the OpenClaw gateway:

    ```bash
    openclaw gateway run
    ```

3.  **Pair the Bot**

    - Send any message to the bot in Feishu, and the system will generate a pairing code (letters + numbers)
    - The pairing code is valid for 5 minutes; if it expires, trigger again
    - Run the following command on the server to complete the binding:
      ```bash
      openclaw pairing approve feishu <pairing_code> --notify
      ```

4.  **Complete Authorization**

    Follow the prompts in Feishu to complete authorization, so OpenClaw can perform tasks like reading messages, docs, bitables, and calendars on your behalf.

    > If you don't want to authorize now, you can start the conversation directly and enter `/feishu auth` later to complete batch authorization.

5.  **Start Chatting**

    Your bot is now ready. To verify installation, enter `/feishu start` in the dialog; if it returns version info, the installation is successful.

    To teach the bot new skills, tell it: "Learn about my new Feishu plugin, list what capabilities it has"

## Configuration

The plugin offers several configuration options to tailor its behavior. All settings are located under the `channels.feishu` key in your `openclaw.json`.

- `replyMode` (string | object): Controls how the AI delivers responses.
    - `"auto"` (default): Uses streaming replies for DMs and static replies for group chats.
    - `"streaming"`: Always use streaming card replies.
    - `"static"`: Always send the response after it's fully generated.

- `dmPolicy` (string): Access policy for direct messages.
    - `"open"` (default): Responds to all DMs.
    - `"pairing"`: Requires users to pair with a code before they can interact with the bot.
    - `"allowlist"`: Only responds to whitelisted users.

- `groupPolicy` (string): Access policy for group chats.
    - `"open"`: Allows interaction in any group chat when the bot is @mentioned.
    - `"allowlist"` (recommended): Only works in whitelisted group chats.
    - `"disabled"`: Disables all group chat interactions.

- `requireMention` (boolean): If `true` (default), the bot will only respond in group chats when it is @mentioned.

For more detailed configuration options, see [FEATURES.md](./openclaw/feishu/FEATURES.md).

## Common Commands

```bash
# View current configuration
openclaw config get channels.feishu

# Set to require @ mention to reply
openclaw config set channels.feishu.requireMention true --json

# Set to reply to all messages
openclaw config set channels.feishu.requireMention open --json

# Set specific group to require @ mention
openclaw config set channels.feishu.groups.群ID.requireMention true --json

# Enable streaming output
openclaw config set channels.feishu.streaming true

# Enable elapsed time display in streaming
openclaw config set channels.feishu.footer.elapsed true

# Enable status display in streaming
openclaw config set channels.feishu.footer.status true

# View channel status
openclaw channels status

# Upgrade plugin
feishu-plugin-onboard update

# Diagnose issues
feishu-plugin-onboard doctor

# Fix issues
feishu-plugin-onboard doctor --fix

# View version info
feishu-plugin-onboard info

# View detailed config info
feishu-plugin-onboard info --all
```

### Group Chat Reply Modes

**Mode 1: Only reply when @ mentioned (default)**
```bash
openclaw config set channels.feishu.requireMention true --json
```

**Mode 2: Reply to all messages**
```bash
openclaw config set channels.feishu.requireMention false --json
```
> Note: This mode can spam in large groups, use with caution!

**Mode 3: Only specific groups require @ mention (advanced)**
```bash
# First set default to not require @ for all groups
openclaw config set channels.feishu.requireMention open --json
# Then set specific group to require @
openclaw config set channels.feishu.groups.oc_xxxxxxxx.requireMention true --json
```

## FAQ

1.  **Why isn't Windows supported?**
    *   This is a known issue in the OpenClaw core. You can track its progress at [openclaw/openclaw#7631](https://github.com/openclaw/openclaw/issues/7631).

2.  **I see a `Cannot find module 'xxx'` error on startup.**
    *   This usually means the plugin's dependencies were not installed correctly. Navigate to the plugin directory at `~/.openclaw/extensions/feishu-openclaw-plugin` and run `npm install --production` to manually install them.

3.  **The bot reports "insufficient permissions" when trying to read a doc or send a message.**
    *   Log in to the Feishu/Lark Developer Console and ensure your application has been granted the necessary API permissions. For example, reading a document requires the `docx:document:readonly` scope, and sending messages requires `im:message:send_as_bot` permission.

4.  **How to quickly complete user authorization?**
    *   Tell the AI: "I want to grant all user permissions" to complete batch authorization.
    *   Or enter `/feishu auth` to complete batch user authorization.

5.  **How to verify installation success?**
    *   Enter `/feishu start` in the dialog; if it returns version info, installation is successful.
    *   Enter `/feishu doctor` to check if configuration is normal.

6.  **How to update the plugin?**
    *   Run the following command:
      ```bash
      feishu-plugin-onboard update
      ```
    *   If you cannot find this command, you need to install the installer first (see installation steps).

## Contributing

Contributions from the community are welcome! If you find a bug or have a feature request, please open an [Issue](https://github.com/larksuite/openclaw-larksuite/issues) or submit a [Pull Request](https://github.com/larksuite/openclaw-larksuite/pulls).

For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the **MIT License**. See the [LICENSE](./openclaw/feishu/LICENSE) file for details.
