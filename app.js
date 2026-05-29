// ======================= 全局状态 =======================
let currentView = 'chart';               // 'chart' 或 'table'
let chartInstance = null;                // ECharts 实例
let currentChartFile = null;             // 当前图表对应的数据文件名（不含扩展名）
let currentTableFile = null;             // 当前表格对应的数据文件名

// 存储从服务器获取的文件列表
let dataFiles = [];                      // data/ 下所有 .json 文件的 basename
let plotConfigMap = new Map();           // 记录哪些数据文件有对应的 plot_config 文件

// ======================= 1. 获取 data/ 目录下所有 JSON 文件列表 =======================
// 说明：前端无法直接列举目录，这里采用请求一个约定好的接口 `/api/data-files`
// 如果后端未提供，可以返回一个默认列表（生产环境应改为真实 API）
async function fetchDataFileList() {
    try {
        // 方法1：请求后端提供的文件清单（推荐）
        // const res = await fetch('/api/data-files');
        // const data = await res.json();
        // return data.files;   // 期望 ['clothSales', 'other', ...]

        // 方法2（示例）：由于没有真实后端，这里模拟一个请求并返回默认列表
        // 实际使用时请替换为真实 API 地址
        const mockFiles = JSON.parse(MOCK_FILE);
        console.warn('使用模拟文件列表，请替换为真实API: /api/data-files');
        return mockFiles;
    } catch (err) {
        console.error('获取文件列表失败', err);
        return [];
    }
}

// 检查每个数据文件是否有对应的图表配置（plot_config/xxx.json）
async function checkPlotConfigs(files) {
    const map = new Map();
    for (const f of files) {
        try {
            const res = await fetch(`plot_config/${f}.json`);
            if (res.ok) {
                map.set(f, await res.json());
            } else {
                map.set(f, null);   // 没有配置文件
            }
        } catch {
            map.set(f, null);
        }
    }
    return map;
}

// 初始化下拉菜单选项
async function initSelectors() {
    dataFiles = await fetchDataFileList();
    if (dataFiles.length === 0) {
        console.error('未找到任何数据文件');
        return;
    }
    // 获取图表配置映射
    plotConfigMap = await checkPlotConfigs(dataFiles);

    // 填充图表选择器
    const chartSelect = document.getElementById('chart-selector');
    const tableSelect = document.getElementById('table-selector');
    if (chartSelect) {
        chartSelect.innerHTML = '';
        for (const f of dataFiles) {
            const option = document.createElement('option');
            option.value = f;
            // 显示名称：如果有配置文件，可从中获取标题，否则用文件名
            const config = plotConfigMap.get(f);
            const displayName = config?.title?.text || f;
            option.textContent = displayName;
            chartSelect.appendChild(option);
        }
        // 默认选中第一个
        if (dataFiles.length > 0) {
            currentChartFile = dataFiles[0];
            chartSelect.value = currentChartFile;
        }
    }

    if (tableSelect) {
        tableSelect.innerHTML = '';
        for (const f of dataFiles) {
            const option = document.createElement('option');
            option.value = f;
            option.textContent = f;   // 表格直接用文件名显示
            tableSelect.appendChild(option);
        }
        if (dataFiles.length > 0) {
            currentTableFile = dataFiles[0];
            tableSelect.value = currentTableFile;
        }
    }

    // 绑定下拉菜单变更事件
    chartSelect?.addEventListener('change', (e) => {
        currentChartFile = e.target.value;
        if (currentView === 'chart') renderCurrentChart();
    });
    tableSelect?.addEventListener('change', (e) => {
        currentTableFile = e.target.value;
        if (currentView === 'table') renderCurrentTable();
    });
}

// ======================= 2. 通用数据加载 =======================
async function loadJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

// 加载数据文件（data/xxx.json）
async function loadDataFile(basename) {
    return loadJson(`data/${basename}.json`);
}

// ======================= 3. 图表渲染（合并 data 和 plot_config） =======================

// 清洗 plot_config 中与数据注入冲突的属性
function sanitizeAxis(axis, asCategory) {
    if (!axis) return;
    if (asCategory) {
        axis.type = 'category';
        // 删除数值轴专属属性，避免与 category 类型冲突
        delete axis.min;
        delete axis.max;
        delete axis.minInterval;
        delete axis.interval;
        delete axis.scale;
    }
    // yAxis 不需要 data（使用 series.data 而非 dataset）
    if (!asCategory) {
        delete axis.data;
    }
}


async function renderChart(basename) {
    try {
        const data = await loadDataFile(basename);
        const categories = data.categories || [];
        const values = data.values || [];

        let userConfig = plotConfigMap.get(basename);
        let option;

        if (userConfig) {
            option = JSON.parse(JSON.stringify(userConfig));

            // ---- 清洗并注入 xAxis ----
            if (Array.isArray(option.xAxis)) {
                sanitizeAxis(option.xAxis[0], true);
                option.xAxis[0].data = categories;
            } else if (option.xAxis) {
                sanitizeAxis(option.xAxis, true);
                option.xAxis.data = categories;
            } else {
                option.xAxis = { type: 'category', data: categories };
            }

            // ---- 清洗 yAxis ----
            if (Array.isArray(option.yAxis)) {
                sanitizeAxis(option.yAxis[0], false);
            } else if (option.yAxis) {
                sanitizeAxis(option.yAxis, false);
            }

            // ---- 清洗并注入 series ----
            if (option.series && option.series.length > 0) {
                option.series[0].data = values;
            } else {
                option.series = [{ type: 'bar', data: values }];
            }
        } else {
            option = {
                title: { text: basename, left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: categories, name: '类别' },
                yAxis: { type: 'value', name: '数值' },
                series: [{ type: 'bar', data: values, name: basename }]
            };
        }

        const dom = document.getElementById('chart');
        if (!dom) return;
        if (chartInstance) chartInstance.dispose();
        chartInstance = echarts.init(dom);
        chartInstance.setOption(option);
    } catch (err) {
        console.error(`渲染图表 ${basename} 失败:`, err);
        document.getElementById('chart').innerHTML = `<div class="alert alert-danger">图表 ${basename} 加载失败</div>`;
    }
}

async function renderCurrentChart() {
    if (currentChartFile) await renderChart(currentChartFile);
}

// ======================= 4. 表格渲染（纯 data JSON） =======================
async function renderTable(basename) {
    try {
        const data = await loadDataFile(basename);
        const categories = data.categories || [];
        const values = data.values || [];
        const tbody = document.querySelector('#data-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        categories.forEach((cat, idx) => {
            const row = `<tr><td>${escapeHtml(cat)}</td><td>${escapeHtml(values[idx] ?? '')}</td></tr>`;
            tbody.insertAdjacentHTML('beforeend', row);
        });
        // 更新表格标题
        const caption = document.querySelector('#data-table caption');
        if (caption) caption.textContent = basename;
        else {
            const newCaption = document.createElement('caption');
            newCaption.textContent = basename;
            document.querySelector('#data-table').prepend(newCaption);
        }
    } catch (err) {
        console.error(`渲染表格 ${basename} 失败:`, err);
        const tbody = document.querySelector('#data-table tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="2" class="text-danger">表格 ${basename} 数据加载失败</td></tr>`;
    }
}

async function renderCurrentTable() {
    if (currentTableFile) await renderTable(currentTableFile);
}

// 简单的防XSS（自动将数字等转为字符串）, 需要先转字符串, 以免数字被误防
function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ======================= 5. Tab 切换逻辑 =======================
function initTabs() {
    const chartTabBtn = document.querySelector('[data-target="chart"]');
    const tableTabBtn = document.querySelector('[data-target="table"]');
    const chartSelectorDiv = document.querySelector('.chart-selector');
    const tableSelectorDiv = document.querySelector('.table-selector');
    const chartDiv = document.getElementById('chart');
    const tableContainer = document.getElementById('table-container');

    if (!chartTabBtn || !tableTabBtn) return;

    const switchToChart = () => {
        if (currentView === 'chart') return;
        currentView = 'chart';
        // 更新tab样式
        chartTabBtn.classList.add('active');
        tableTabBtn.classList.remove('active');
        // 显示/隐藏对应的下拉菜单和内容区
        chartSelectorDiv.style.display = 'block';
        tableSelectorDiv.style.display = 'none';
        chartDiv.style.display = 'block';
        tableContainer.style.display = 'none';
        // 注意：这里不再调用 renderCurrentChart()
        // 因为当前视图可能还没有合适的图表数据，但下拉菜单的 change 事件会在必要时触发渲染
        // 为了确保显示正确，可以手动触发一次当前图表下拉菜单的 change 事件
        const chartSelect = document.getElementById('chart-selector');
        if (chartSelect) {
            chartSelect.dispatchEvent(new Event('change'));
        }
    };

    const switchToTable = () => {
        if (currentView === 'table') return;
        currentView = 'table';
        tableTabBtn.classList.add('active');
        chartTabBtn.classList.remove('active');
        chartSelectorDiv.style.display = 'none';
        tableSelectorDiv.style.display = 'block';
        chartDiv.style.display = 'none';
        tableContainer.style.display = 'block';
        const tableSelect = document.getElementById('table-selector');
        if (tableSelect) {
            tableSelect.dispatchEvent(new Event('change'));
        }
    };

    chartTabBtn.addEventListener('click', switchToChart);
    tableTabBtn.addEventListener('click', switchToTable);
}

// ======================= 6. Markdown 链接监听（支持 #xxx_chart 和 #xxx_table） =======================
function initMarkdownLinks() {
    const container = document.getElementById('markdown-content');
    if (!container) return;
    container.addEventListener('click', async (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        const target = href.slice(1);  // 例如 "clothSales_chart"

        // 解析后缀
        let basename = null;
        let type = null;
        if (target.endsWith('_chart')) {
            basename = target.slice(0, -6);
            type = 'chart';
        } else if (target.endsWith('_table')) {
            basename = target.slice(0, -6);
            type = 'table';
        }
        if (!basename || !dataFiles.includes(basename)) {
            console.warn(`未找到数据文件: ${basename}`);
            return;
        }

        e.preventDefault();

        if (type === 'chart') {
            // 1. 更新全局变量和下拉菜单的值
            currentChartFile = basename;
            const chartSelect = document.getElementById('chart-selector');
            if (chartSelect) {
                chartSelect.value = basename;
                // 2. 强制触发 change 事件，让下拉菜单的监听器完成渲染（同时会检查 currentView）
                chartSelect.dispatchEvent(new Event('change'));
            }
            // 3. 确保当前视图是图表视图（如果已是图表视图，上述 change 已经渲染；如果不是，则需要切换视图）
            if (currentView !== 'chart') {
                // 切换视图（Tab 的 click 内部会再次触发当前下拉菜单的 change 事件，确保渲染）
                const chartTab = document.querySelector('[data-target="chart"]');
                if (chartTab) chartTab.click();
            }
        } else if (type === 'table') {
            currentTableFile = basename;
            const tableSelect = document.getElementById('table-selector');
            if (tableSelect) {
                tableSelect.value = basename;
                tableSelect.dispatchEvent(new Event('change'));
            }
            if (currentView !== 'table') {
                const tableTab = document.querySelector('[data-target="table"]');
                if (tableTab) tableTab.click();
            }
        }
    });
}

// ======================= 7. 加载左侧 Markdown 文档 =======================
async function loadMarkdown() {
    const container = document.getElementById('markdown-content');
    if (!container) return;
    try {
        const res = await fetch('project_plan.md');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const md = await res.text();
        container.innerHTML = marked.parse(md);
        // 渲染完成后绑定链接监听
        initMarkdownLinks();
    } catch (err) {
        console.error('加载说明文档失败:', err);
        container.innerHTML = '<div class="alert alert-warning">project_plan.md 加载失败，请确保文件存在。</div>';
    }
}

// ======================= 8. 启动应用 =======================
document.addEventListener('DOMContentLoaded', async () => {
    // 第一步：获取文件列表并初始化下拉菜单
    await initSelectors();
    // 第二步：初始化 Tab 切换
    initTabs();
    // 第三步：加载左侧 Markdown
    loadMarkdown();
    // 第四步：默认渲染当前图表（因为初始视图是 chart）
    if (currentChartFile) await renderCurrentChart();
    // 预加载当前表格（但隐藏，不显示），以便切换时快速显示
    if (currentTableFile) await renderCurrentTable();
});