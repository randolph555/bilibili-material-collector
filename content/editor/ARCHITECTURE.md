# 编辑器架构说明

## ⚠️ 开发流程规范（必读）

### 修改需求前必须执行：

1. **先搜索，后修改** - 使用 grep 搜索所有相关代码，列出完整清单
   ```bash
   # 例：修改时长相关逻辑前
   grep -r "sourceEnd - sourceStart" content/editor/
   grep -r "displayDuration" content/editor/
   grep -r "getClipDuration" content/editor/
   ```

2. **列出影响范围** - 明确列出所有需要修改的文件和方法

3. **逐个检查修改** - 按清单逐一修改，不要遗漏

4. **交叉验证** - 修改后检查上下游是否一致：
   - 数据层改了 → 检查 UI 层、播放层
   - 计算逻辑改了 → 检查所有使用该值的地方

### 为什么这样做：
- 同一个概念（如"片段时长"）分散在 6+ 个文件中
- 改一处漏其他地方是最常见的 bug 来源
- LLM 局部视野有限，必须主动搜索全局

---

## 核心数据流

```
用户操作 → TimelineManager → EditorCore/TrackManager → 数据变更
                                      ↓
                              TimeController (时间)
                                      ↓
                              CompositorPlayer (播放)
                                      ↓
                              UI 更新 (渲染)
```

## 片段(Clip)数据结构

```javascript
{
  id: string,
  type: 'video' | 'image' | 'text' | 'sticker',
  
  // 源数据
  video: Object,           // 视频信息
  sourceStart: number,     // 源视频起点（秒）
  sourceEnd: number,       // 源视频终点（秒）
  
  // 时间轴位置
  timelineStart: number,   // 时间轴起点
  displayDuration: number, // 显示时长（可以 > 源时长，循环播放）
  
  // 变换
  transform: Object,
  color: Object,
  stretchMode: 'loop' | 'stretch' | 'freeze'
}
```

## 关键方法位置

| 功能 | 文件 | 方法 |
|------|------|------|
| 获取片段时长 | track-manager.js | `getClipDuration(clip)` |
| 获取片段结束时间 | track-manager.js | `getClipEnd(clip)` |
| 计算源时间(循环) | track-manager.js | `getSourceTimeAtPlayhead(clip, time)` |
| 播放循环检测 | compositor.js | `_onTimeUpdate()` |
| 裁剪/拉伸 | timeline.js | `onTrimMove()` |
| 渲染片段 | timeline.js | `renderTrackClips()` |

## 修改检查清单

### 修改"片段时长"相关逻辑时，检查：

- [ ] `TrackManager.getClipDuration()` - 时长计算
- [ ] `TrackManager.getClipEnd()` - 结束时间
- [ ] `TrackManager.getSourceTimeAtPlayhead()` - 源时间计算
- [ ] `TrackManager.getActiveClipsAtTime()` - 活动片段查询
- [ ] `TrackManager.calculateContentDuration()` - 总时长
- [ ] `TrackManager.splitClip()` - 切割逻辑
- [ ] `TimeController.recalculateDuration()` - **时间轴总时长计算**
- [ ] `TimelineManager.renderTrackClips()` - UI 渲染
- [ ] `TimelineManager.updateClipPosition()` - 位置更新
- [ ] `TimelineManager.onTrimMove()` - 裁剪逻辑
- [ ] `TimelineDrag.getSnapPoints()` - 吸附点
- [ ] `CompositorPlayer.getClipAtTime()` - 播放器查询
- [ ] `CompositorPlayer._onTimeUpdate()` - 播放循环

### 修改"播放控制"相关逻辑时，检查：

- [ ] `TimeController` - 时间状态
- [ ] `CompositorPlayer.play/pause/seekTo()` - 播放控制
- [ ] `CompositorPlayer._onTimeUpdate()` - 播放循环
- [ ] `PlayerController` - UI 控制

### 添加新元素类型时，检查：

- [ ] `TrackManager.createClip()` - 创建逻辑
- [ ] `TrackManager.ElementTypes` - 类型定义
- [ ] `TimelineManager.renderTrackClips()` - 渲染逻辑
- [ ] `CompositorPlayer` - 播放逻辑

## 常见遗漏点

1. **时长计算**：`sourceEnd - sourceStart` vs `displayDuration`
   - 显示/渲染用 `displayDuration`
   - 循环计算用 `sourceEnd - sourceStart`

2. **循环播放**：
   - 时间轴时间 → 源时间需要取模
   - 播放器需要检测并跳回起点

3. **兼容旧数据**：
   - 旧片段没有 `displayDuration`，需要 fallback 到 `sourceEnd - sourceStart`

4. **多处引用**：
   - 同一个值可能在 timeline.js、compositor.js、track-manager.js 都有使用
