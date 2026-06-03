/**
 * 物理掉落物配置
 *
 * 图片路径：public/assets/ → 浏览器访问 /assets/
 * 调整显示与碰撞大小：修改 width / height（像素）
 */
export interface PhysicsItemConfig {
  id: string;
  image: string;
  width: number;
  height: number;
}

/** 原图均为 1417×1417，此处统一缩放至 120×120 用于屏幕显示与物理碰撞 */
export const PHYSICS_ITEMS: PhysicsItemConfig[] = [
  { id: "item-1", image: "/assets/1.png", width: 120, height: 120 },
  { id: "item-2", image: "/assets/2.png", width: 120, height: 120 },
  { id: "item-3", image: "/assets/3.png", width: 120, height: 120 },
  { id: "item-4", image: "/assets/4.png", width: 120, height: 120 },
  { id: "item-5", image: "/assets/5.png", width: 120, height: 120 },
  { id: "item-6", image: "/assets/6.png", width: 120, height: 120 },
  { id: "item-7", image: "/assets/7.png", width: 120, height: 120 },
  { id: "item-8", image: "/assets/8.png", width: 120, height: 120 },
  { id: "item-9", image: "/assets/9.png", width: 120, height: 120 },
  { id: "item-10", image: "/assets/10.png", width: 120, height: 120 },
  { id: "item-11", image: "/assets/11.png", width: 120, height: 120 },
  { id: "item-12", image: "/assets/12.png", width: 120, height: 120 },
];
