# 📝 ArchFlow v1.0 语言规范 (Specification)

English version: [`SPEC.en.md`](SPEC.en.md)

## 1. 核心哲学

- **Contract-first DSL**：先声明跨模块契约，再生成模块实现；契约是 AI 分工、Mock、Stub 与运行时装配的共同边界。
- **绘画式建模**：先轮廓（@），后线条（$），再细节（.）。
- **物理隔离**：模块间默认透明，除非定义通道（=>）。
- **AI 友好**：极高的符号密度，最小化 Token 消耗。

---

## 2. 语法体系 (The Grammar)

### A. 实体定义 (Entities)

| 符号        | 名称          | 语义说明                                             |
| :---------- | :------------ | :--------------------------------------------------- |
| **`@`**     | **Component** | 独立的物理/逻辑单元（如：微服务、前端应用、Agent）。 |
| **`%`**     | **Resource**  | 外部基础设施（如：数据库、硬件、第三方 API）。       |
| **`[` `]`** | **Action**    | 模块内部的具体函数、处理步骤或原子操作。             |
| **`(` `)`** | **State**     | 系统或数据的当前状态（如：Idle, Pending, Success）。 |

### B. 连接与拓扑 (Topology)

| 符号     | 名称                 | 语义说明                                                |
| :------- | :------------------- | :------------------------------------------------------ |
| **`>>`** | **Internal Flow**    | 模块**内部**的顺序逻辑或函数调用。                      |
| **`=>`** | **Isolated Channel** | 模块**之间**的唯一物理通道。强制解耦，必须定义 Schema。 |
| **`&`**  | **Parallel**         | 并行执行的任务。                                        |
| **`~`**  | **Inference**        | 涉及 AI 模型推理或模糊处理的节点。                      |

### C. 控制逻辑 (Logic Control)

| 符号    | 名称          | 语义说明                                 |
| :------ | :------------ | :--------------------------------------- |
| **`$`** | **Workflow**  | 定义一个持续的循环、生命周期或主业务流。 |
| **`?`** | **Condition** | 逻辑分支（If-Then-Else）。               |
| **`!`** | **Exception** | 错误处理、中断、回滚逻辑。               |

### D. 元数据 (Metadata)

| 符号    | 名称          | 语义说明                                          |
| :------ | :------------ | :------------------------------------------------ |
| **`.`** | **Attribute** | 定义技术栈、版本、约束条件（如 `.Stack: Rust`）。 |
| **`#`** | **Comment**   | 给人或架构师 AI 的说明文字。                      |

Contract-first 约定使用 Attribute 体系表达，不新增独立的 Contract 语法块：

- `.Schema.<Channel>: <description>`：为某个 `=> [Channel] =>` 绑定接口契约说明；每个跨模块通道都必须有对应 Schema。
- `.Standard: <standard>`：声明契约解释与生成时采用的默认协议或格式（如 `REST_JSON`）。
- `.Stack: <stack>`：声明模块实现栈；不得改变已经由 `.Schema` 固定的跨模块边界。

运行时装配仍使用 Attribute 体系表达，不新增独立的 Profile 语法块：

- `.Runtime.Port.<profile>: <port>`：声明模块在某个运行环境中的端口。
- `.Expose.<Channel>: <transport> <method> <path>`：声明目标模块如何暴露入站通道。
- `.Use.<Channel>.<profile>: <mode>:<value>`：声明源模块在某个运行环境中如何连接出站通道。

`dev`、`test`、`prod` 等 profile 名称来自 attribute suffix，并在编译产物 `runtime.json` 中成为一等 runtime model。

---

## 3. 层级规则 (Layering Rules)

ArchFlow 采用 **缩进嵌套** 表示深度：

1.  **L1 (Root)**: 描述全局 `@Modules` 和它们之间的 `=>` 通道。
2.  **L2 (Module SDL)**: 描述模块内的 `$Workflow` 和核心 `[Actions]`。
3.  **L3 (Detail)**: 描述 `[Action]` 的输入输出 `Schema` 与具体算法。

契约优先级高于实现细节：`.Schema.<Channel>` 固定通道输入输出语义，`@Module` 内部的 `$Workflow` 只能消费或产出这些契约允许的数据。编译器应先校验通道是否具备 Schema，再生成模块 Prompt、Mock、Stub 与运行时装配信息。

---

## 4. 示例：标准描述文件

```archflow
# 全局架构描述
.System: API_Publish_Platform
.Standard: REST_JSON
.Schema.HTTPS/Auth: 已认证的发布请求，包含标题、正文、作者令牌与发布目标。
.Schema.Redis_PubSub: 发布事件消息，包含文章 ID、发布状态与同步指令。

# L1: 轮廓与隔离通道
@Client_UI => [HTTPS/Auth] => @Manager_Backend
@Manager_Backend => [Redis_PubSub] => @Gateway_Sync_Worker

# L2: 模块细节下钻
@Manager_Backend:
  .Stack: Node.js/TypeScript
  $Publish_Flow:
    [Req_Validate] >> [DB_Save] >> [Push_To_Channel]
    ! On_Error >> [Log] >> (Fail_Response)

@Gateway_Sync_Worker:
  .Stack: Go
  $Listen_Loop:
    (Idle) >> [Wait_Channel] >> [Apply_To_Nginx]
    ! Auth_Fail >> [Alert]
```

---

## 5. 编译指令 (For AI Architect)

当你将此文件交给 AI 时，请附带以下指令：

> **指令：**
>
> 1. **解析**：读取 ArchFlow 文本，构建依赖图。
> 2. **校验契约**：确保每个 `=> [Channel] =>` 都有对应 `.Schema.<Channel>`，并将 Schema 作为唯一跨模块数据边界。
> 3. **膨胀**：将每个 `[Action]` 转化为伪代码逻辑，将每个 `.Schema` 转化为接口契约 (Contract)、Mock 与 Stub。
> 4. **分片**：生成 `N` 个独立的 Prompt，每个 Prompt 包含该模块的所有元数据 `.`、内部逻辑 `$SQL` 以及入站/出站契约。
> 5. **强制隔离**：在生成分片任务时，严禁模块间引用非契约允许的任何外部变量。

---

## 6. 扩展性说明

- **自定义符号**：允许用户在 `.Extensions` 中临时定义符号（如：`*` 代表广播）。
- **版本控制**：本规范为 `v1.0`，后续支持通过 `.Version` 声明兼容性。
