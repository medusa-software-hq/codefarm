import dev.detekt.gradle.extensions.DetektExtension
import org.gradle.api.tasks.testing.logging.TestExceptionFormat

plugins {
  alias(libs.plugins.kotlin.jvm) apply false
  alias(libs.plugins.ktfmt) apply false
  alias(libs.plugins.detekt) apply false
}

val kotlinJvmPluginId = libs.plugins.kotlin.jvm.get().pluginId
val ktfmtPluginId = libs.plugins.ktfmt.get().pluginId
val detektPluginId = libs.plugins.detekt.get().pluginId

val javaVersion = 25

allprojects { repositories { mavenCentral() } }

subprojects {
  pluginManager.withPlugin(kotlinJvmPluginId) {
    pluginManager.apply(ktfmtPluginId)
    pluginManager.apply(detektPluginId)

    extensions.configure<DetektExtension> {
      buildUponDefaultConfig = true
      config.setFrom(rootProject.file("detekt.yml"))
    }

    tasks.named("check") { dependsOn(tasks.named("ktfmtCheck")) }

    extensions.configure<JavaPluginExtension> {
      toolchain { languageVersion = JavaLanguageVersion.of(javaVersion) }
    }

    // Preserve parameter names in bytecode for runtime reflection
    tasks.withType<JavaCompile>().configureEach { options.compilerArgs.add("-parameters") }
  }

  // The same sources give the same archives, and so the same images
  tasks.withType<AbstractArchiveTask>().configureEach {
    isPreserveFileTimestamps = false
    isReproducibleFileOrder = true
  }

  tasks.withType<Test>().configureEach {
    useJUnitPlatform()

    testLogging {
      events("failed")
      exceptionFormat = TestExceptionFormat.FULL
      showStackTraces = true
      showCauses = true
    }
  }
}
