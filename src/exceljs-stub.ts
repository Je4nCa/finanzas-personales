// La vista previa (artifact) no puede descargar archivos: exportar a Excel solo funciona en la app instalada.
export default {
  Workbook: class {
    constructor() {
      throw new Error('Exportar a Excel está disponible en la app instalada')
    }
  },
}
