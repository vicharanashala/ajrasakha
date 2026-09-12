import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import os
from flask import Flask, request, Response
from dotenv import load_dotenv
from handlers import FeedbackHandler
from services import WhatsAppService
from config import TwilioConfig

load_dotenv()

app = Flask(__name__)

feedback_handler = FeedbackHandler()
whatsapp_service = WhatsAppService()


@app.route("/webhook", methods=["POST"])
def whatsapp_webhook():
    try:
        from_number = request.values.get("From", "")
        to_number = request.values.get("To", "")
        body = request.values.get("Body", "")
        message_sid = request.values.get("MessageSid", "")

        formatted_number = WhatsAppService.format_whatsapp_number(from_number)

        print(f"\n=== Incoming Message ===")
        print(f"From: {formatted_number}")
        print(f"Body: {body}")
        print(f"MessageSid: {message_sid}")
        print(f"========================\n")

        msg_type, parsed = feedback_handler.whatsapp_service.parse_incoming_message(body)

        if msg_type == "feedback":
            confirmation = feedback_handler.handle_farmer_response(formatted_number, body)
            print(f"Feedback handled: {confirmation}")

        elif msg_type == "query":
            response = feedback_handler.handle_incoming_query(
                farmer_id=formatted_number,
                query=body
            )
            print(f"Query handled: {response}")

        else:
            whatsapp_service.send_message(
                formatted_number,
                "Invalid response. Please reply 1 for Yes or 2 for No."
            )

        return Response(status=200)

    except Exception as e:
        print(f"Error processing message: {e}")
        return Response(status=500)


@app.route("/webhook", methods=["GET"])
def verify_webhook():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    verify_token = os.getenv("WEBHOOK_VERIFY_TOKEN", "ajrasakha_verify_token")

    if mode == "subscribe" and token == verify_token:
        return Response(challenge, status=200)
    return Response(status=403)


@app.route("/health", methods=["GET"])
def health_check():
    return {"status": "healthy", "service": "whatsapp-bot"}


@app.route("/", methods=["GET"])
def index():
    return {
        "service": "AjraSakha WhatsApp Bot",
        "version": "1.0.0",
        "status": "running"
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("DEBUG", "true").lower() == "true"

    print(f"\n{'='*50}")
    print(f"AjraSakha WhatsApp Bot")
    print(f"{'='*50}")
    print(f"Twilio Configured: {TwilioConfig.is_configured()}")
    print(f"Webhook URL: /webhook")
    print(f"Health Check: /health")
    print(f"{'='*50}\n")

    app.run(host="0.0.0.0", port=port, debug=debug)