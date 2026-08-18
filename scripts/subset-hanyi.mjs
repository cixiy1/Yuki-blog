// 临时脚本：为汉仪瘦金书简生成文章用字子集 woff2
import subsetFont from 'subset-font';
import fs from 'node:fs';

// 《小施施七夕快乐》书信版（《二郎神·炎光谢》柳永，已多源核实）全部可见字符：
// 全词 + 信头/落款/角标 + 常用标点/数字/字母兜底
const chars = `炎光谢过暮雨芳尘轻洒乍露冷风清庭户爽天如水玉钩遥挂应是星娥嗟久阻叙旧约飙轮欲驾极目处微云暗度耿耿银河高泻闲雅须知此景古今无价运巧思穿针楼上女抬粉面云鬟相亚钿合金钗私语处算谁在回廊影下愿天上人间占得欢娱年年今夜
丙午年七月初七星河为凭小之帆手书小施施织女星牵牛星二郎神宋柳永
小施施七夕快乐愿得一人心白首不分离此信致
，。！？·——：；、"'（）…0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ `;

const buf = fs.readFileSync('../fonts-src/hanyi-shoujinti.ttf');
const woff2 = await subsetFont(buf, chars, {
  targetFormat: 'woff2',
  preserveNameTable: true,
});
fs.writeFileSync('public/assets/fonts/hanyi-shoujinti-subset.woff2', woff2);
console.log('subset size:', (woff2.length / 1024).toFixed(1), 'KB', '(原 5.03MB)');
