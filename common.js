document.addEventListener("DOMContentLoaded", () => {
    fetch("navbar.html")
        .then(res => res.text())  // 取出 promise 中 response 的内容
        .then(html => {
            document.getElementById('navbar-placeholder').innerHTML = html;  // 声明式结尾加; 
        });
});