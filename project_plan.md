This is the project outline: very nice

```bash
$ tree
.
|-- app.js
|-- data
|   `-- cloths.json
|-- index.html
|-- plot_config
|   `-- bar_options.json
|-- project_plan.md
`-- protocols
    |-- bar.py
    |-- bar_options.json
    `-- protocols.html/
````````````````````````

The process is listed below:

1. 利用 *Python Pyechart* 作图形的原型开发
   - 基本数据清洗和聚合后将数据导出为`data/*.json` 中
   - 在 `protocols` 文件夹中进行原型开发，使用 `data/*.json` 利用 *Pyechart* 结合 *live server* 在网页中呈现效果，并可调整单个图形元素的布局和大小。
   - 将基准的 *pyechart* 的设置导出，**将数据选项清空**(不需要动态更新，不需要清空)，导出到`plot_config/*.json` ，
   - 在主页面`index.html` 中，头尾分别导入 *echart.js*  和 *app.js*，中间部分设置占位符(图片未显示出来时显示)，
   - 在主应用 `app.js` 中，设置数据加载逻辑，异步并发加载`data/*.json` 与 `plot_config/*.json` ，通过 *ajax* 注入数据(有利于之后的*Restful API* 动态更新数据)

这是一个单页面应用, 一切的跳转都基于 *JS* 的监听, 现在对右侧[衣物销量图](#cloths_chart) 进行引用, 查看跳转情况, 或者 [全美平均犯罪率表](#guns_table), 

最大最小的折线设置, 可能会影响到集成图表的显示,

先使用 *ipython* 在下载中处理出 `.json` 文件后, 确保格式的一致性, 再复制到项目文件中, 再来进一步处理

简要记录如下:

```python
import pandas as pd
df = pd.read_csv('Guns.csv')
a = df.groupby('year').violent.mean().round(2).reset_index()
import json
json.dumps(a, indent=2, ensure_ascii=False)
result = {
    "categories": a["year"].tolist(),
    "values": a["violent"].tolist()
}
print(json.dumps(result, indent=2, ensure_ascii=False))
json.dumps(result, 'guns.json' indent=2, ensure_ascii=False)
!cat guns.json | clip
```


此时并不存在后端API, **因此前端的下拉菜单中的选项只能硬编码**; 此外还存在耦合的是, data/ 和 plot_config/ 内的 `*.json` 文件需要同名显示, 