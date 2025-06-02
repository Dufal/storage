document.addEventListener('DOMContentLoaded', () => {
    // Обработчики для Drag & Drop
    setupDragDrop('malware-drop-area', 'malware-upload', 'malware-filename');
    setupDragDrop('report-drop-area', 'report-upload', 'report-filename');

    function setupDragDrop(dropAreaId, inputId, filenameId) {
        const dropArea = document.getElementById(dropAreaId);
        const fileInput = document.getElementById(inputId);
        const filenameDisplay = document.getElementById(filenameId);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });

        function highlight() {
            dropArea.classList.add('drag-over');
        }

        function unhighlight() {
            dropArea.classList.remove('drag-over');
        }

        dropArea.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length) {
                fileInput.files = files;
                updateFilenameDisplay();
                fileInput.dispatchEvent(new Event('change'));
            }
        }

        function updateFilenameDisplay() {
            const files = fileInput.files;
            if (files && files.length > 0) {
                filenameDisplay.textContent = files[0].name;
                filenameDisplay.style.display = 'block';
            } else {
                filenameDisplay.textContent = '';
                filenameDisplay.style.display = 'none';
            }
        }

        fileInput.addEventListener('change', updateFilenameDisplay);
    }

    const activeSubcategory = document.querySelector('.category-list li.active');
    toggleUploadForm(!!activeSubcategory);
    loadFiles('all');
    updateCategoryChart('all');

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            const group = this.dataset.group;
            toggleUploadForm(false);

            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.category-list li').forEach(el => el.classList.remove('active'));
            this.classList.add('active');

            toggleCategoryList(this, group);
            loadFiles(category);
            updateCategoryChart(category);
            updateCategoryTitle(this);
        });
    });

    document.querySelectorAll('.category-list li').forEach(item => {
        item.addEventListener('click', function() {
            const [category, subcategory] = this.dataset.category.split('->').map(s => s.trim());
            const parentList = this.closest('.category-list');
            const parentBtn = document.querySelector(`.category-btn[data-group="${parentList.dataset.group}"]`);
            toggleUploadForm(true);

            document.querySelectorAll('.category-list li').forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            if (parentBtn) parentBtn.classList.add('active');

            loadFiles(category, subcategory);
            document.getElementById('categoryChart').style.display = 'none';
            document.getElementById('chartLegend').style.display = 'none';
            updateCategoryTitle(this);
        });
    });

    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const activeSubcategory = document.querySelector('.category-list li.active');
        const activeCategory = document.querySelector('.category-btn.active');

        let category = 'all';
        let subcategory = 'uncategorized';

        if (activeSubcategory) {
            [category, subcategory] = activeSubcategory.dataset.category.split('->').map(s => s.trim());
        } else if (activeCategory) {
            category = activeCategory.dataset.category;
            subcategory = 'uncategorized';
        }

        formData.append('category', category);
        formData.append('subcategory', subcategory);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                alert('Файлы успешно загружены!');
                if (activeSubcategory) {
                    loadFiles(category, subcategory);
                } else {
                    loadFiles(category);
                }
                e.target.reset();
                document.getElementById('malware-filename').style.display = 'none';
                document.getElementById('report-filename').style.display = 'none';
            } else {
                throw new Error(result.error || 'Неизвестная ошибка при загрузке');
            }
        } catch (error) {
            alert('Ошибка загрузки: ' + error.message);
        }
    });

    document.getElementById('malware-upload').addEventListener('change', function(e) {
        const fileName = e.target.files[0]?.name || 'Файл не выбран';
        const display = document.getElementById('malware-filename');
        display.textContent = fileName;
        display.classList.add('filename-animate');
        setTimeout(() => display.classList.remove('filename-animate'), 500);
    });

    document.getElementById('report-upload').addEventListener('change', function(e) {
        const fileName = e.target.files[0]?.name || 'Файл не выбран';
        const display = document.getElementById('report-filename');
        display.textContent = fileName;
        display.classList.add('filename-animate');
        setTimeout(() => display.classList.remove('filename-animate'), 500);
    });
});

function toggleCategoryList(button, group) {
    const currentList = document.querySelector(`.category-list[data-group="${group}"]`);
    const isCollapsed = currentList.classList.contains('collapsed');

    document.querySelectorAll('.category-list').forEach(list => {
        list.classList.add('collapsed');
        const btn = document.querySelector(`.category-btn[data-group="${list.dataset.group}"]`);
        if (btn) btn.querySelector('.toggle-icon').textContent = '▶';
    });

    if (isCollapsed) {
        currentList.classList.remove('collapsed');
        button.querySelector('.toggle-icon').textContent = '▼';
    }
}

async function loadFiles(category, subcategory) {
    try {
        const params = new URLSearchParams();
        if (category) params.append('category', category);
        if (subcategory) params.append('subcategory', subcategory);

        const response = await fetch(`/files?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
            displayFiles(data.files);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        document.getElementById('fileList').innerHTML = `
            <div class="error">Ошибка загрузки: ${error.message}</div>
        `;
    }
}

function displayFiles(files) {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    if (!files || files.length === 0) {
        fileList.innerHTML = '<div class="no-files">Файлы не найдены</div>';
        return;
    }

    const malwareColumn = document.createElement('div');
    malwareColumn.className = 'file-column';
    malwareColumn.innerHTML = '<h3 class="neon-blue">ВПО</h3><ul class="file-list"></ul>';

    const reportsColumn = document.createElement('div');
    reportsColumn.className = 'file-column';
    reportsColumn.innerHTML = '<h3 class="neon-pink">ОТЧЕТЫ</h3><ul class="file-list"></ul>';

    files.forEach(file => {
        // Для архива
        if (file.malwarePath) {
            const malwareItem = document.createElement('li');
            malwareItem.className = 'file-item';
            malwareItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-category">${escapeHtml(file.category)} → ${escapeHtml(file.subcategory)}</div>
                    <div class="file-date">${new Date(file.createdAt).toLocaleString()}</div>
                </div>
            `;
            malwareColumn.querySelector('ul').appendChild(malwareItem);
        }

        // Для отчета
        if (file.reportPath) {
            const reportItem = document.createElement('li');
            reportItem.className = 'file-item';
            reportItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${escapeHtml(file.reportOriginalName)}</div>
                    <div class="file-category">${escapeHtml(file.category)} → ${escapeHtml(file.subcategory)}</div>
                    <div class="file-date">${new Date(file.createdAt).toLocaleString()}</div>
                </div>
                <div class="file-actions">
                    <button onclick="downloadFile('${file.id}')">ЗАГРУЗИТЬ</button>
                    <button onclick="viewReport('${file.id}')">ПРОСМОТР</button>
                    <button onclick="showDeleteOptions('${file.id}')" class="delete-btn">УДАЛИТЬ</button>
                </div>
            `;
            reportsColumn.querySelector('ul').appendChild(reportItem);
        }

        // Если запись неполная (отсутствует архив или отчет)
        if (!file.malwarePath || !file.reportPath) {
            const missingPart = !file.malwarePath ? 'malware' : 'report';
            displaySupplementButton(file.id, missingPart);
        }
    });

    fileList.appendChild(malwareColumn);
    fileList.appendChild(reportsColumn);
}

function updateCategoryTitle(element) {
    const title = element.textContent.replace(/▼|▶/g, '').trim();
    document.getElementById('current-category').innerHTML = `
        <span class="neon-blue">[</span> ОТПРАВИТЬ В: 
        <span class="neon-pink">${title}</span> 
        <span class="neon-blue">]</span>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function downloadFile(fileId) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `/download?id=${fileId}`;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 10000);
}

function toggleUploadForm(show) {
    const uploadSection = document.getElementById('uploadSection');
    const uploadForm = document.getElementById('uploadForm');

    if (show) {
        uploadForm.style.display = 'block';
        uploadSection.style.display = 'block';
    } else {
        uploadForm.style.display = 'none';
        uploadSection.style.display = 'none';
    }
}

const CATEGORY_COLORS = {
    'Трояны': '#4cc9f0',
    'Вымогатели': '#f72585',
    'Черви': '#7209b7',
    'Шпионы': '#4895ef',
    'Руткиты': '#3a0ca3',
    'uncategorized': '#b5179e'
};

async function updateCategoryChart(category = null) {
    try {
        const chart = document.getElementById('categoryChart');
        const legend = document.getElementById('chartLegend');

        chart.style.display = 'block';
        legend.style.display = 'block';

        const url = category ? `/stats?category=${category}` : '/stats';
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            renderPieChart(data.stats);
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        renderPieChart([]);
    }
}

function renderPieChart(stats) {
    const chart = document.getElementById('categoryChart');
    const legend = document.getElementById('chartLegend');

    const filteredStats = stats.filter(item => item.count > 0);

    if (filteredStats.length === 0) {
        chart.style.background = 'rgba(20, 25, 45, 0.5)';
        chart.innerHTML = '<div class="no-data">Нет данных</div>';
        legend.innerHTML = '';
        return;
    }

    const total = filteredStats.reduce((sum, item) => sum + item.count, 0);
    let cumulativePercent = 0;

    const gradientParts = filteredStats.map(item => {
        const percent = (item.count / total) * 100;
        const part = `${CATEGORY_COLORS[item.subcategory]} ${cumulativePercent}% ${cumulativePercent + percent}%`;
        cumulativePercent += percent;
        return part;
    }).join(', ');

    chart.style.background = `conic-gradient(${gradientParts})`;
    chart.innerHTML = '';

    legend.innerHTML = filteredStats.map(item => `
        <div class="legend-item">
            <div class="legend-color" style="background: ${CATEGORY_COLORS[item.subcategory]}"></div>
            <span>${item.subcategory}: ${item.count} (${Math.round((item.count / total) * 100)}%)</span>
        </div>
    `).join('');
}

async function viewReport(fileId) {
    try {
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = 'Загрузка отчета...';
        document.body.appendChild(loadingIndicator);

        const response = await fetch(`/report?id=${fileId}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        }

        const blob = await response.blob();

        // Проверка Content-Type
        if (!response.headers.get('Content-Type').includes('vnd.openxmlformats-officedocument.wordprocessingml.document')) {
            throw new Error('Полученный файл не является DOCX документом');
        }

        // Проверка первых байтов
        const arrayBuffer = await blob.arrayBuffer();
        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
        const hex = Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hex !== '504b0304') {
            throw new Error('Файл не является валидным DOCX (неправильная ZIP-сигнатура)');
        }

        // Используем FileReader для чтения файла
        const reader = new FileReader();

        reader.onload = function() {
            try {
                const arrayBuffer = this.result;
                if (!window.mammoth) {
                    throw new Error('Библиотека Mammoth не загружена');
                }

                // Используем mammoth.convertToHtml для преобразования в HTML
                mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                    .then(function(result) {
                        showReportModal(result.value);
                        loadingIndicator.remove();
                    })
                    .catch(function(error) {
                        console.error('Mammoth conversion error:', error);
                        loadingIndicator.remove();
                        alert('Ошибка при обработке отчета: ' + error.message);
                    });
            } catch (error) {
                console.error('Reader processing error:', error);
                loadingIndicator.remove();
                alert('Ошибка при чтении файла: ' + error.message);
            }
        };

        reader.onerror = function() {
            console.error('FileReader error:', this.error);
            loadingIndicator.remove();
            alert('Ошибка при чтении файла: ' + this.error.message);
        };

        reader.readAsArrayBuffer(blob);
    } catch (error) {
        console.error('Error loading report:', error);
        alert(`Ошибка загрузки отчета: ${error.message}`);
        document.querySelector('.loading-indicator')?.remove();
    }
}

function showReportModal(content) {
    const modal = document.createElement('div');
    modal.className = 'report-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Просмотр отчета</h3>
                <button onclick="this.closest('.report-modal').remove()">×</button>
            </div>
            <div class="modal-body">${content}</div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Функция показа модального окна с вариантами удаления
function showDeleteOptions(fileId) {
    const modal = document.createElement('div');
    modal.className = 'delete-modal';
    modal.innerHTML = `
        <div class="delete-modal-content">
            <h3 style="color: #f72585; text-align: center; margin-bottom: 20px;">Выберите что удалить</h3>
            <button class="delete-option" onclick="deleteFilePart('${fileId}', 'malware')">Только архив</button>
            <button class="delete-option" onclick="deleteFilePart('${fileId}', 'report')">Только отчет</button>
            <button class="delete-option" onclick="deleteFilePart('${fileId}', 'all')">Удалить все</button>
            <button class="delete-option" style="background: transparent; border: 1px solid #4cc9f0; margin-top: 20px;" 
                    onclick="this.closest('.delete-modal').remove()">ОТМЕНА</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// Функция удаления файлов
async function deleteFilePart(fileId, part) {
    try {
        // Добавим лог для отладки
        console.log(`Attempting to delete ${part} for file ID: ${fileId}`);

        const response = await fetch(`/delete?id=${encodeURIComponent(fileId)}&part=${encodeURIComponent(part)}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Проверим статус ответа
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            // Закрываем модальное окно удаления
            document.querySelector('.delete-modal')?.remove();

            // Обновляем список файлов
            const activeSubcategory = document.querySelector('.category-list li.active');
            const activeCategory = document.querySelector('.category-btn.active');

            if (activeSubcategory) {
                const [category, subcategory] = activeSubcategory.dataset.category.split('->').map(s => s.trim());
                loadFiles(category, subcategory);
            } else if (activeCategory) {
                loadFiles(activeCategory.dataset.category);
            } else {
                loadFiles('all');
            }

            alert('Удаление выполнено успешно');
        } else {
            throw new Error(result.error || 'Ошибка при удалении');
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Ошибка удаления: ' + error.message);
    }
}

// Функция для отображения кнопки "Дополнить"
function displaySupplementButton(fileId, missingPart) {
    const fileList = document.getElementById('fileList');
    const supplementDiv = document.createElement('div');
    supplementDiv.className = 'supplement-section';
    supplementDiv.innerHTML = `
        <div style="text-align: center; margin: 20px 0;">
            <p style="color: #f72585;">Файл неполный. Вы можете дополнить его:</p>
            <button onclick="showSupplementForm('${fileId}', '${missingPart}')" class="supplement-btn">
                ДОПОЛНИТЬ
            </button>
        </div>
    `;
    fileList.appendChild(supplementDiv);
}

// Функция показа формы для дополнения
function showSupplementForm(fileId, missingPart) {
    const form = document.createElement('div');
    form.className = 'supplement-form';
    form.innerHTML = `
        <div style="background: rgba(20, 25, 45, 0.9); padding: 20px; border: 1px solid #4cc9f0; border-radius: 5px;">
            <h3 style="color: #4cc9f0; margin-top: 0;">Добавить ${missingPart === 'malware' ? 'архив' : 'отчет'}</h3>
            <div class="drag-drop-area" id="supplement-drop-area">
                <input type="file" id="supplement-upload" name="${missingPart}" 
                       accept="${missingPart === 'malware' ? '.zip,.rar,.7z' : '.docx'}" required>
                <label for="supplement-upload" class="drag-drop-label">
                    <span class="upload-icon">↑</span>
                    <span class="upload-text">Перетащите файл или нажмите</span>
                    <span class="file-requirements">${missingPart === 'malware' ? '(ZIP, RAR, 7Z)' : '(DOCX)'}</span>
                </label>
                <div id="supplement-filename" class="filename-display"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 15px;">
                <button onclick="submitSupplement('${fileId}', '${missingPart}')" 
                        class="cyber-submit-button" style="width: 48%;">
                    ОТПРАВИТЬ
                </button>
                <button onclick="this.closest('.supplement-form').remove()" 
                        class="cyber-submit-button" style="width: 48%; background: #f72585;">
                    ОТМЕНА
                </button>
            </div>
        </div>
    `;

    // Добавляем обработчики для drag and drop
    setupDragDrop('supplement-drop-area', 'supplement-upload', 'supplement-filename');

    document.body.appendChild(form);
}

// Функция отправки дополнения
async function submitSupplement(fileId, part) {
    const fileInput = document.getElementById('supplement-upload');
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Пожалуйста, выберите файл');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('part', part);

    try {
        const response = await fetch(`/supplement?id=${fileId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            alert('Файл успешно добавлен');
            document.querySelector('.supplement-form')?.remove();
            document.querySelector('.supplement-section')?.remove();

            // Обновляем список файлов
            const activeSubcategory = document.querySelector('.category-list li.active');
            const activeCategory = document.querySelector('.category-btn.active');

            if (activeSubcategory) {
                const [category, subcategory] = activeSubcategory.dataset.category.split('->').map(s => s.trim());
                loadFiles(category, subcategory);
            } else if (activeCategory) {
                loadFiles(activeCategory.dataset.category);
            } else {
                loadFiles('all');
            }
        } else {
            throw new Error(result.error || 'Ошибка при добавлении файла');
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}