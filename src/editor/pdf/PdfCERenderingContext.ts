import { CERenderingContext, DrawArea, FontProperty, LineDrawer, LineProperty } from '../interface/CERenderingContext'
import jsPDF from 'jspdf'
import { getUUID } from '../utils'
import { ITextMetrics } from '../interface/Text'


const canvas = document.createElement('canvas')
const canvasCtx = canvas.getContext('2d')!

export class PdfCERenderingContext implements CERenderingContext {

  private textDirection: any = {}

  constructor(private pageNo: number, private doc: jsPDF) {
  }

  get currentPage() {
    return this.pageNo
  }

  get pdf() {
    return this.doc
  }

  public drawImage(value: HTMLImageElement | string, dx: number, dy: number, width: number, height: number): void {
    this._execRestore(() => {
      this.doc.addImage(value, '', dx, dy, width, height, '', 'FAST')
    })
  }

  fillRect(x: number, y: number, width: number, height: number, prop: LineProperty): void {
    this._execRestore(() => {
      if (prop.translate) {
        this.translate(...prop.translate)
      }
      this.doc.setFillColor(prop.fillColor ?? '#fff')
      this.doc.setGState(this.doc.GState({ opacity: prop.alpha ?? 1 }))
      this.doc.rect(x, y, width, height, 'F')
    })
  }

  strokeRect(x: number, y: number, width: number, height: number, prop: LineProperty): void {
    this._execRestore(() => {
      if (prop.translate) {
        this.translate(...prop.translate)
      }
      this.doc.setDrawColor(prop.fillColor ?? '#000')
      this.doc.setGState(this.doc.GState({ 'stroke-opacity': prop.alpha ?? 1 }))
      this.doc.rect(x, y, width, height, 'S')
    })
  }

  circle(x: number, y: number, r: number, prop: LineProperty): void {

    this._execRestore(() => {

      let style
      if (prop.fillColor && prop.color) {
        style = 'FD'
        this.doc.setFillColor(prop.fillColor)
        this.doc.setDrawColor(prop.color)
      } else {
        if (prop.fillColor) {
          style = 'F'
          this.doc.setFillColor(prop.fillColor)
        }
        if (prop.color) {
          style = 'S'
          this.doc.setDrawColor(prop.color)
        }
      }

      this.doc.circle(x, y, r, style)
    })
  }


  line(prop: LineProperty): LineDrawer {
    return new PdfRenderingContextLineDrawer(this, prop)
  }

  text(text: string, x: number, y: number, prop: FontProperty): void {
    this._execRestore(() => {
      if (prop.font) this.doc.setFont(prop.font)
      if (prop.size) this.doc.setFontSize(prop.size)
      if (prop.color) this.doc.setTextColor(prop.color)
      if (prop.translate && prop.translate.length === 2) this.translate(...prop.translate)
      if (prop.alpha || prop.alpha === 0) this.doc.setGState(this.doc.GState({ 'stroke-opacity': prop.alpha ?? 1 }))
      this.doc.text(text, x, y, {
        align: prop.textAlign,
        baseline: prop.textBaseline,
        ...this.textDirection
      })
    })
  }

  private _execRestore(exec: () => void): void {
    const pn = this.doc.getCurrentPageInfo().pageNumber
    this.doc.setPage(this.pageNo)
    this.doc.saveGraphicsState()
    try {
      exec()
    } finally {
      this.doc.setPage(pn)
      this.doc.restoreGraphicsState()
    }
  }

  translate(x: number, y: number): void {
    const matrix = this.doc.Matrix(1.0, 0.0, 0.0, 1.0, x, y)
    this.doc.setCurrentTransformationMatrix(matrix)
  }

  scale(scaleWidth: number, scaleHeight: number): void {
    const matrix = this.doc.Matrix(scaleWidth, 0.0, 0.0, scaleHeight, 0.0, 0.0)
    this.doc.setCurrentTransformationMatrix(matrix)
  }


  rotate(d: number): void {
    const matrix = this.doc.Matrix(
      Math.cos(d),
      Math.sin(d),
      -Math.sin(d),
      Math.cos(d),
      0.0,
      0.0
    )
    this.doc.setCurrentTransformationMatrix(matrix)
  }


  initPageContext(scale: number, direction: string): void {
    const matrix = this.doc.Matrix(scale, 0.0, 0.0, scale, 0.0, 0.0)
    this.doc.setCurrentTransformationMatrix(matrix)
    if (direction === 'rtl') {
      this.pdf.setR2L(true)
    }
  }

  setGlobalAlpha(): void {
    // pdf
  }

  getGlobalAlpha(): number {
    return 1
  }

  // 这个方法返回值不准确，jspdf 中没有打到对应的接口
  measureText(text: string, prop: FontProperty): ITextMetrics {
    let font
    if (prop && prop.size && prop.font) {
      font = `${prop.fontStyle ?? ''} ${prop.fontWeight ?? ''} ${prop.size ? `${prop.size}px` : ''} ${prop.font ?? ''}`
    }

    if (font && font.trim().length > 0) {
      canvasCtx.save()
      canvasCtx.font = font
    }
    const metrics = canvasCtx.measureText(text)
    if (font && font.trim().length > 0) {
      canvasCtx.restore()
    }
    return metrics
  }

  getFont(): string {
    const font = this.doc.getFont()
    const size = this.doc.getFontSize()
    return `${size}px ${font.fontStyle} ${font.fontName}`
  }

  addWatermark(data: HTMLCanvasElement, area: DrawArea): void {
    const { startX, startY, height, width } = area
    const dataW = data.width
    const dataH = data.height

    const y = Math.ceil(height / dataH)
    const x = Math.ceil(width / dataW)

    const alias = getUUID()
    for (let i = 0; i < y; i++) {
      for (let j = 0; j < x; j++) {
        this.pdf.addImage({
          imageData: data, x: startX + j * dataW, y: startY + i * dataH, width: dataW, height: dataH, alias
        })
      }
    }
  }

  cleanPage(): void {
    this.doc.deletePage(this.pageNo - 1)
    this.doc.insertPage(this.pageNo - 1)
  }
}

export class PdfRenderingContextLineDrawer implements LineDrawer {
  private actions: (() => void)[] = []
  private _beforeDraw: ((ctx: CERenderingContext) => void) | null = null
  private readonly alpha: number
  private readonly lineWidth: number
  private readonly strikeoutColor: string

  constructor(private ctx: PdfCERenderingContext, private prop: LineProperty) {
    this.alpha = this.prop.alpha ?? 1
    this.lineWidth = this.prop.lineWidth ?? 1
    this.strikeoutColor = this.prop.color ?? '#000'
  }

  beforeDraw(action: (ctx: CERenderingContext) => void): LineDrawer {
    this._beforeDraw = action
    return this
  }


  draw(): void {
    if (!this.actions.length) {
      return
    }
    const pn = this.ctx.pdf.getCurrentPageInfo().pageNumber
    const doc = this.ctx.pdf
    doc.setPage(this.ctx.currentPage)
    doc.saveGraphicsState()
    doc.setLineWidth(this.lineWidth)
    doc.setGState(doc.GState({ 'stroke-opacity': this.alpha }))
    doc.setDrawColor(this.strikeoutColor)
    if (this.prop.lineCap) {
      doc.setLineCap(this.prop.lineCap)
    }
    if (this.prop.lineJoin) {
      doc.setLineJoin(this.prop.lineJoin)
    }
    if (this.prop.lineDash) {
      doc.setLineDashPattern(this.prop.lineDash, 0)
    }
    try {
      if (typeof this._beforeDraw === 'function') {
        this._beforeDraw(this.ctx)
      }
      for (let i = 0; i < this.actions.length; i++) {
        this.actions[i]()
      }
    } finally {
      doc.setPage(pn)
      doc.restoreGraphicsState()
    }
  }

  path(x1: number, y1: number, x2?: number, y2?: number): LineDrawer {
    this.actions.push(() => {
      if (!x2 || !y2) {
        // 传两个参数
        this.ctx.pdf.lineTo(x1, y1)
      } else {
        this.ctx.pdf.line(x1, y1, x2, y2, 'S')
      }
    })
    return this
  }

}

