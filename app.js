let db;
let editandoId = null;
let registrosGlobales = [];
let categoriasCargadas = {};

/* INICIO DB */
const request = indexedDB.open("RegistroDB", 2);
request.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("registro")) db.createObjectStore("registro", { keyPath: "id", autoIncrement: true });
  if (!db.objectStoreNames.contains("categorias")) db.createObjectStore("categorias", { keyPath: "tipo" });
};
request.onsuccess = (e) => {
  db = e.target.result;
  verificarCategorias();
};

async function verificarCategorias() {
    const tx = db.transaction("categorias", "readwrite");
    const store = tx.objectStore("categorias");
    store.getAll().onsuccess = (e) => {
        if (e.target.result.length === 0) {
            const defecto = [
                { tipo: "Ingresos", lista: ["Sueldo", "Ventas"] },
                { tipo: "Egresos", lista: ["Comida", "Alquiler", "Salidas"] },
                { tipo: "Ahorros", lista: ["Fondo Emergencia"] }
            ];
            defecto.forEach(c => store.put(c));
            tx.oncomplete = () => cargarApp();
        } else {
            cargarApp();
        }
    };
}

function cargarApp() {
    const tx = db.transaction("categorias", "readonly");
    tx.objectStore("categorias").getAll().onsuccess = (e) => {
        e.target.result.forEach(c => categoriasCargadas[c.tipo] = c.lista);
        inicializarUI();
    };
}

function inicializarUI() {
    // 1. Configuración del Mes (con validación para evitar el error 'null')
    const ms = document.getElementById("mesSelect");
    if (ms) {
        ms.value = new Date().toISOString().slice(0, 7);
        ms.onchange = () => actualizarVista();
    } else {
        console.warn("Aviso: No se encontró el elemento 'mesSelect'.");
    }

    // 2. Registro y Selectores de Categoría
    const tipoSelect = document.getElementById("tipoSelect");
    if (tipoSelect) {
        tipoSelect.onchange = () => {
            const catSelect = document.getElementById("categoriaSelect");
            if (catSelect) {
                catSelect.innerHTML = "";
                (categoriasCargadas[tipoSelect.value] || []).forEach(c => {
                    const opt = document.createElement("option");
                    opt.value = c; opt.textContent = c;
                    catSelect.appendChild(opt);
                });
            }
        };
    }

    // 3. Botón de Agregar Nuevo Registro
    const btnAgregar = document.getElementById("btnAgregar");
    if (btnAgregar) {
        btnAgregar.onclick = () => {
            editandoId = null;
            const form = document.getElementById("registroForm");
            if (form) form.reset();
            
            const titulo = document.getElementById("modalTitulo");
            if (titulo) titulo.textContent = "Nuevo Registro";
            
            if (tipoSelect) tipoSelect.dispatchEvent(new Event("change"));
            
            const modal = document.getElementById("modalRegistro");
            if (modal) modal.style.display = "flex";
        };
    }

    const cerrarModal = document.getElementById("cerrarModal");
    if (cerrarModal) {
        cerrarModal.onclick = () => {
            const modal = document.getElementById("modalRegistro");
            if (modal) modal.style.display = "none";
        };
    }

    // 4. Gestión de Categorías
    const btnCat = document.getElementById("btnGestionarCategorias");
    if (btnCat) {
        btnCat.onclick = () => {
            const tipoCat = document.getElementById("tipoCatSelect");
            if (tipoCat) {
                renderListaCategorias(tipoCat.value);
                const modalCat = document.getElementById("modalCategorias");
                if (modalCat) modalCat.style.display = "flex";
            }
        };
    }

    const tipoCatSelect = document.getElementById("tipoCatSelect");
    if (tipoCatSelect) {
        tipoCatSelect.onchange = (e) => renderListaCategorias(e.target.value);
    }

    const cerrarModalCat = document.getElementById("cerrarModalCat");
    if (cerrarModalCat) {
        cerrarModalCat.onclick = () => {
            const modalCat = document.getElementById("modalCategorias");
            if (modalCat) modalCat.style.display = "none";
        };
    }

const montoInput = document.getElementById("monto");
if (montoInput) {
    montoInput.type = "text"; // Para que acepte el formato $ 0.000,00
    montoInput.setAttribute("inputmode", "decimal"); // Fuerza el teclado numérico con coma/punto
    
    montoInput.addEventListener("input", (e) => {
        let val = e.target.value.replace(/[^\d]/g, "");
        if (val) {
            let n = parseFloat(val) / 100;
            e.target.value = n.toLocaleString('es-AR', { 
                style: 'currency', 
                currency: 'ARS' 
            });
        }
    });
}

    // 5. Botones de Expandir Tablas
    document.querySelectorAll(".btnExpand").forEach(btn => {
        btn.onclick = () => {
            const tipo = btn.dataset.tipo;
            // Usamos ms.value solo si ms existe, sino usamos el mes actual por defecto
            const mesValor = ms ? ms.value : new Date().toISOString().slice(0, 7);
            const filtrados = registrosGlobales.filter(r => r.tipo === tipo && r.fecha.slice(0, 7) === mesValor);
            abrirModalExpandido(tipo, filtrados);
        };
    });

    // 6. Backup y Datos (Dentro de inicializarUI)
const btnExportar = document.getElementById("btnExportar");
if (btnExportar) btnExportar.onclick = exportarJSON;

const btnImportar = document.getElementById("btnImportar");
const importFile = document.getElementById("importFile");

if (btnImportar && importFile) {
    btnImportar.onclick = () => {
        importFile.value = ""; // Limpiamos el valor para que deje re-subir el mismo archivo
        importFile.click();
    };
    importFile.onchange = (e) => importarJSON(e);
}

    // 7. Sidebar (Menu Lateral) - Configuración Final
    const menuBtn = document.getElementById("menuBtn");
    const sidebar = document.getElementById("sidebar");
    const cerrarSidebar = document.getElementById("cerrarSidebar");

    if (menuBtn && sidebar) {
        menuBtn.onclick = () => sidebar.classList.add("abierto");
    }
    
    if (cerrarSidebar && sidebar) {
        cerrarSidebar.onclick = () => sidebar.classList.remove("abierto");
    }

    // Ejecutar la vista inicial
    actualizarVista();
}

function actualizarVista() {
    const mes = document.getElementById("mesSelect").value;
    const store = db.transaction("registro", "readonly").objectStore("registro");
    registrosGlobales = [];
    const balances = { Ingresos: 0, Egresos: 0, Ahorros: 0 };
    const egresosPorCategoria = {}; // Para el gráfico de barras

    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            registrosGlobales.push(cursor.value);
            cursor.continue();
        } else {
            // 1. Ordenar por fecha (Descendente)
            registrosGlobales.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            
            const filtrados = registrosGlobales.filter(r => r.fecha.slice(0, 7) === mes);
            
            // 2. Calcular totales y agrupar egresos por categoría
            filtrados.forEach(r => {
                balances[r.tipo] += r.monto;
                if(r.tipo === "Egresos") {
                    egresosPorCategoria[r.categoria] = (egresosPorCategoria[r.categoria] || 0) + r.monto;
                }
            });
            
            // 3. Renderizar tablas simples
            renderTablaSimple(filtrados.filter(r => r.tipo === "Ingresos"), "tablaIngresos");
            renderTablaSimple(filtrados.filter(r => r.tipo === "Egresos"), "tablaEgresos");
            renderTablaSimple(filtrados.filter(r => r.tipo === "Ahorros"), "tablaAhorros");
            
            // 4. Dibujar ambos gráficos
            dibujarGraficoTorta(balances);
            dibujarGraficoBarras(egresosPorCategoria);
            
            actualizarBalanceTotal(balances);
        }
    };
}

function renderTablaSimple(data, idCont) {
    const cont = document.getElementById(idCont);
    cont.innerHTML = "";
    let html = `<table><thead><tr><th>Fecha</th><th>Cat.</th><th>Monto</th></tr></thead><tbody>`;
    data.forEach(r => {
        // Formateo de fecha DD/MM/YYYY
        const fechaFull = r.fecha.split("-").reverse().join("/"); 
        // Formateo de moneda Argentina
        const montoAr = r.monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
        
        html += `<tr>
            <td style="color:var(--text-muted)">${fechaFull}</td>
            <td>${r.categoria}</td>
            <td style="font-weight:bold">${montoAr}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    cont.innerHTML = html;
}

function abrirModalExpandido(titulo, data) {
    const cont = document.getElementById("modalTablaContenido");
    document.getElementById("modalTablaTitulo").textContent = titulo;
    let html = `<table><thead><tr><th>Fecha</th><th>Cat.</th><th>Detalle</th><th>Monto</th><th>Acciones</th></tr></thead><tbody>`;
    data.forEach(r => {
        const fechaFormateada = r.fecha.split("-").reverse().join("/");
        const montoAr = r.monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
        
        html += `<tr>
            <td>${fechaFormateada}</td>
            <td>${r.categoria}</td>
            <td style="font-size:0.85em; color:var(--text-muted)">${r.detalle || "-"}</td>
            <td style="font-weight:bold">${montoAr}</td>
            <td>
                <div class="acciones">
                    <button class="btn-edit" onclick="editar(${r.id})">✏️</button>
                    <button class="btn-delete" onclick="borrar(${r.id})">🗑️</button>
                </div>
            </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    cont.innerHTML = html;
    document.getElementById("modalTabla").style.display = "flex";
}

document.getElementById("cerrarModalTabla").onclick = () => document.getElementById("modalTabla").style.display = "none";

// Formulario Guardar
document.getElementById("registroForm").onsubmit = (e) => {
    e.preventDefault();
    
    // Usamos la función limpiarMonto para obtener el número real
    const montoLimpio = limpiarMonto(document.getElementById("monto").value);

    const data = {
        fecha: document.getElementById("fecha").value,
        tipo: document.getElementById("tipoSelect").value,
        categoria: document.getElementById("categoriaSelect").value,
        monto: montoLimpio, // Guardamos el número limpio
        detalle: document.getElementById("detalle").value
    };
    
    const tx = db.transaction("registro", "readwrite");
    if (editandoId) data.id = editandoId;
    tx.objectStore("registro").put(data);
    tx.oncomplete = () => {
        document.getElementById("modalRegistro").style.display = "none";
        actualizarVista();
    };
};

/* --- OTRAS FUNCIONES --- */
window.borrar = (id) => {
    if(!confirm("¿Eliminar?")) return;
    db.transaction("registro", "readwrite").objectStore("registro").delete(id).onsuccess = () => {
        document.getElementById("modalTabla").style.display = "none";
        actualizarVista();
    };
};

window.editar = (id) => {
    const r = registrosGlobales.find(x => x.id === id);
    editandoId = id;

    // Cambiamos el título del modal a "Editar Registro"
    const titulo = document.getElementById("modalTitulo");
    if (titulo) titulo.textContent = "Editar Registro";

    document.getElementById("fecha").value = r.fecha;
    document.getElementById("tipoSelect").value = r.tipo;
    document.getElementById("tipoSelect").dispatchEvent(new Event("change"));
    document.getElementById("categoriaSelect").value = r.categoria;
    document.getElementById("monto").value = r.monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    document.getElementById("detalle").value = r.detalle;
    document.getElementById("modalTabla").style.display = "none";
    document.getElementById("modalRegistro").style.display = "flex";
};

function renderListaCategorias(tipo) {
    const cont = document.getElementById("listaCategorias");
    cont.innerHTML = "";
    categoriasCargadas[tipo].forEach((c, idx) => {
        cont.innerHTML += `<div style="display:flex; justify:space-between; padding:5px; border-bottom:1px solid #eee;">
            <span>${c}</span>
            <button onclick="borrarCat('${tipo}', ${idx})" style="color:red; background:none;">✖</button>
        </div>`;
    });
}

window.borrarCat = (tipo, idx) => {
    // Agregamos el cartel de confirmación
    if (!confirm("¿Estás seguro de que querés eliminar esta categoría?")) return;

    categoriasCargadas[tipo].splice(idx, 1);
    
    const tx = db.transaction("categorias", "readwrite");
    tx.objectStore("categorias").put({ tipo, lista: categoriasCargadas[tipo] });
    
    tx.oncomplete = () => {
        renderListaCategorias(tipo); // Refresca la lista en el modal
        actualizarVista();           // Refresca las tablas y el gráfico de fondo
    };
};

document.getElementById("btnSumarCat").onclick = () => {
    const nombre = document.getElementById("nuevaCatNombre").value.trim();
    const tipo = document.getElementById("tipoCatSelect").value;
    
    if (!nombre) return;
    
    categoriasCargadas[tipo].push(nombre);
    
    const tx = db.transaction("categorias", "readwrite");
    tx.objectStore("categorias").put({ tipo, lista: categoriasCargadas[tipo] });
    
    tx.oncomplete = () => {
        document.getElementById("nuevaCatNombre").value = "";
        renderListaCategorias(tipo); // Actualiza la lista del modal
        actualizarVista();           // Actualiza las tablas de fondo
    };
};

// Convierte un número o string a formato $ 1.234,56
function formatearParaInput(valor) {
    if (!valor) return "";
    let n = parseFloat(valor.toString().replace(/[^\d]/g, "")) / 100;
    if (isNaN(n)) return "";
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

// Convierte "$ 1.234,56" de nuevo a un número puro (1234.56)
function limpiarMonto(valor) {
    if (!valor) return 0;
    // Quita el $, los puntos de miles y cambia la coma decimal por un punto
    const limpio = valor.replace(/\$/g, "")
                        .replace(/\./g, "")
                        .replace(",", ".");
    return parseFloat(limpio) || 0;
}

function dibujarGraficoTorta(data) {
    const ctx = document.getElementById("graficoTorta").getContext("2d");
    if (window.miChartTorta) window.miChartTorta.destroy();
    window.miChartTorta = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ["Ingresos", "Egresos", "Ahorros"],
            datasets: [{ 
                data: [data.Ingresos, data.Egresos, data.Ahorros], 
                backgroundColor: ['#00c853', '#ff5252', '#2979ff'],
                borderWidth: 0
            }]
        },
        options: { 
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { 
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.parsed || 0;
                            // Formato moneda para el tooltip
                            return ` ${context.label}: ${value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`;
                        }
                    }
                }
            }
        }
    });
}

function dibujarGraficoBarras(agrupado) {
    const ctx = document.getElementById("graficoBarras").getContext("2d");
    if (window.miChartBarras) window.miChartBarras.destroy();
    
    const etiquetas = Object.keys(agrupado);
    const valores = Object.values(agrupado);

    window.miChartBarras = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: etiquetas,
            datasets: [{
                label: 'Gastos por Categoría',
                data: valores,
                backgroundColor: '#ef4444',
                borderRadius: 5
            }]
        },
        options: { 
            maintainAspectRatio: false,
            responsive: true, // Asegura que responda al cambio de tamaño
            layout: {
                padding: {
                    left: 10,
                    right: 25, // Damos espacio a la derecha para que no se corte la última barra
                    top: 10,
                    bottom: 10
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.raw || 0;
                            return ` Monto: ${value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`;
                        }
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { display: false },
                    ticks: {
                        color: '#ffffff',
                        font: { size: 10 },
                        // Formato moneda en el eje lateral (sin decimales para que no ocupe tanto espacio)
                        callback: function(value) {
                            return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
                        }
                    }
                },
                x: { 
                    grid: { display: false },
                    ticks: {
                        color: '#ffffff',
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function actualizarBalanceTotal(b) {
    const total = b.Ingresos - b.Egresos - b.Ahorros;
    const totalAr = total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    
    let div = document.getElementById("balanceTotal");
    if(!div) {
        div = document.createElement("div"); div.id = "balanceTotal";
        // CAMBIA ESTA LÍNEA DE ABAJO:
        div.style = "text-align:center; font-size:24px; font-weight:800; margin:30px 0; padding:20px; background:var(--card); border: 1px solid var(--border); border-radius:15px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);";
        document.querySelector(".container").appendChild(div);
    }
    
    div.textContent = `Disponible: ${totalAr}`;
    div.style.color = total >= 0 ? "var(--primary)" : "var(--danger)";
}

function exportarJSON() {
    db.transaction("registro", "readonly").objectStore("registro").getAll().onsuccess = (e) => {
        const blob = new Blob([JSON.stringify(e.target.result)], {type: "application/json"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "finanzas_backup.json";
        a.click();
    };
}

function importarJSON(e) {
    if (!e.target.files.length) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const datos = JSON.parse(ev.target.result);
            const tx = db.transaction("registro", "readwrite");
            const store = tx.objectStore("registro");
            
            datos.forEach(d => { 
                delete d.id; // Evitamos conflictos de IDs duplicados
                store.add(d); 
            });
            
            tx.oncomplete = () => {
                alert("¡Datos importados con éxito!");
                actualizarVista();
            };
        } catch (err) {
            alert("Error: El archivo no es válido.");
            console.error(err);
        }
    };
    reader.readAsText(e.target.files[0]);
}