#include <SPI.h>
#include <Ethernet.h>
#include <EthernetUdp.h>

// MAC address
byte mac[] = {
  0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED
};
// IP Address
IPAddress ip(192, 168, 1, 123);

unsigned int localPort = 8888; // local port to listen on

// buffers for receiving and sending data
char packetBuffer[UDP_TX_PACKET_MAX_SIZE];  //buffer to hold incoming packet,
char  ReplyBuffer[] = "acknowledged";       // a string to send back

// An EthernetUDP instance to let us send and receive packets over UDP
EthernetUDP Udp;

void setup() {
  // start the Ethernet and UDP:
  Ethernet.begin(mac, ip);
  Udp.begin(localPort);

  pinMode(5, OUTPUT);

  Serial.begin(9600);
  Serial.println(Ethernet.localIP());
}

void loop() {
  // if there's data available, read a packet
  int packetSize = Udp.parsePacket();
  if (packetSize) {
    Serial.print("Received packet of size ");
    Serial.println(packetSize);
    Serial.print("From ");
    IPAddress remote = Udp.remoteIP();
    for (int i = 0; i < 4; i++) {
      Serial.print(remote[i], DEC);
      if (i < 3) {
        Serial.print(".");
      }
    }
    Serial.print(", port ");
    Serial.println(Udp.remotePort());

    // read the packet into packetBufffer
    Udp.read(packetBuffer, UDP_TX_PACKET_MAX_SIZE);
    Serial.println("Contents:");
    Serial.println(packetBuffer);

    // send a reply to the IP address and port that sent us the packet we received
    Udp.beginPacket(Udp.remoteIP(), Udp.remotePort());

    if (packetBuffer[0] == 'o') {
      digitalWrite(5, HIGH);
      delay(1000);
      digitalWrite(5, LOW);
      Udp.write("Opened");
    }
    else {
      Udp.write("unknown");
    }

    Udp.endPacket();
  }
  delay(10);
}
