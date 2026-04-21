from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[2] / "docs" / "Aviate_User_Manual.pdf"

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4)
    _, h = A4
    y = h - 60

    lines = [
        "Aviate App - User Manual",
        "",
        "App Download Link:",
        "https://expo.dev/artifacts/eas/4uEQdzphj6Xfc4eqpKmFxK.apk",
        "",
        "1. Install the App",
        "   - Open the app download link on your Android device.",
        "   - Download and install the APK file.",
        "   - If prompted, allow installation from unknown sources.",
        "",
        "2. Login",
        "   - Open the Aviate app after installation.",
        "   - Enter the Email and Password from this welcome email.",
        "   - Tap Login to access your account.",
        "",
        "3. First Login",
        "   - Sign in using the temporary password provided.",
        "   - Change your password immediately after first login.",
        "",
        "4. Basic Use",
        "   - View your assigned delivery jobs on the home screen.",
        "   - Tap a job to see the list of stops.",
        "   - Mark each stop as completed after delivery.",
        "   - Job closes automatically when all stops are done.",
        "",
        "5. Troubleshooting",
        "   - Check your internet connection if app does not load.",
        "   - Verify your login credentials are correct.",
        "   - Contact your administrator if access is denied.",
        "",
        "For support contact: aviateadminstraction@gmail.com",
    ]

    c.setTitle("Aviate User Manual")
    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, y, lines[0])
    y -= 40
    c.setFont("Helvetica", 11)

    for line in lines[1:]:
        if y < 60:
            c.showPage()
            c.setFont("Helvetica", 11)
            y = h - 60
        c.drawString(50, y, line)
        y -= 20

    c.save()
    print(f"PDF created: {OUT}")

if __name__ == "__main__":
    main()
