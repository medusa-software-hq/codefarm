plugins {
  alias(libs.plugins.kotlin.jvm)
  alias(libs.plugins.ksp)
  alias(libs.plugins.micronaut.library)
  alias(libs.plugins.jib)

  application
}

dependencies {
  implementation("io.micronaut:micronaut-context-propagation")
  implementation("io.micronaut:micronaut-http-server-netty")
  implementation("io.micronaut.kotlin:micronaut-kotlin-runtime")
  implementation("io.micronaut.serde:micronaut-serde-jackson")
  implementation("ch.qos.logback:logback-classic")

  testImplementation("io.micronaut:micronaut-http-client")
  testImplementation(libs.kotlin.test)
}

micronaut {
  runtime("netty")
  testRuntime("junit5")
  processing {
    incremental(true)
    annotations("software.medusa.codefarm.*")
  }
}

application { mainClass = "software.medusa.codefarm.origin.service.MainKt" }

jib {
  from {
    // Pinned by digest, so the same sources always give the same image
    image =
        "eclipse-temurin:25-jre@sha256:fcd7fd7b387f94bb2ac461478a7436ad8e349924c374ea8313919624dceae636"
  }
  container {
    mainClass = application.mainClass.get()
    ports = listOf("8080")
    jvmFlags = listOf("-Dlogback.configurationFile=logback-json.xml")
  }
}
