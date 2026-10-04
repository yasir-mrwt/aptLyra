import pytesseract
from pdf2image import convert_from_bytes
import logging

logger = logging.getLogger("OCRService")

class OCRService:
    @staticmethod
    def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
        """
        Converts PDF bytes into images and performs OCR text extraction page by page.
        """
        logger.info("Executing OCR fallback extraction pipeline")
        try:
            images = convert_from_bytes(file_bytes)
            ocr_text = ""
            for i, img in enumerate(images):
                logger.info(f"Performing OCR on page {i+1}/{len(images)}")
                ocr_text += pytesseract.image_to_string(img) + "\n"
            return ocr_text
        except Exception as e:
            logger.error(f"OCR fallback extraction failed: {str(e)}")
            raise e
