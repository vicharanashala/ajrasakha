class NotificationSoundManager {
  private sounds: Record<string, HTMLAudioElement>;

  constructor() {
    this.sounds = {
      AJRASAKHA: new Audio(
        '/sounds/ajrasakha.mp3',
      ),

      AGRI_EXPERT: new Audio(
        '/sounds/agri_expert.mp3',
      ),

      WHATSAPP: new Audio(
        '/sounds/whatsapp.mp3',
      ),

      DEFAULT: new Audio(
        '/sounds/default.mp3',
      ),
    };
  }

  play(source: string) {
    const sound =
      this.sounds[source] || this.sounds.DEFAULT;

    sound.currentTime = 0;

    sound.play().catch((err) => {
      console.warn(
        'Notification sound blocked:',
        err,
      );
    });
  }
}

export const notificationSoundManager =
  new NotificationSoundManager();