plugins {
  // Allow automatic download of JDKs
  id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "codefarm"

include(":backend:origin:service")
