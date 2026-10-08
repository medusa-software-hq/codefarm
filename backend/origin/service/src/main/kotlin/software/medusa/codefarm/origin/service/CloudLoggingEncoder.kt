package software.medusa.codefarm.origin.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.spi.ThrowableProxyUtil
import ch.qos.logback.core.encoder.EncoderBase
import com.fasterxml.jackson.annotation.JsonProperty
import io.micronaut.serde.ObjectMapper
import io.micronaut.serde.annotation.Serdeable

/** A log entry as Cloud Logging reads it from a line of JSON. */
@Serdeable
data class CloudLoggingEntry(
    val time: String,
    val severity: String,
    val message: String,
    val logger: String,
    // Where Error Reporting looks for it
    @param:JsonProperty("stack_trace") val stackTrace: String?,
    @param:JsonProperty("logging.googleapis.com/trace") val trace: String?,
    @param:JsonProperty("logging.googleapis.com/labels") val labels: Map<String, String>?,
)

/**
 * Writes each event as a line of JSON that Cloud Logging reads into an entry: with its severity,
 * under its request's trace, and with the rest of the log context as labels.
 */
class CloudLoggingEncoder : EncoderBase<ILoggingEvent>() {
  /** The project of the traces, which Cloud Logging names them by; none, no traces. */
  var projectId: String = ""

  // Logback creates the encoder before Micronaut starts, so it has a mapper of its own
  private val objectMapper by lazy { ObjectMapper.getDefault() }

  override fun headerBytes(): ByteArray? = null

  override fun footerBytes(): ByteArray? = null

  override fun encode(event: ILoggingEvent): ByteArray =
      objectMapper.writeValueAsBytes(entry(event)) + '\n'.code.toByte()

  private fun entry(event: ILoggingEvent): CloudLoggingEntry {
    val context = event.mdcPropertyMap
    val traceId = context[traceIdKey]
    val labels = context - traceIdKey

    return CloudLoggingEntry(
        time = event.instant.toString(),
        severity = severity(event.level),
        message = event.formattedMessage,
        logger = event.loggerName,
        stackTrace = event.throwableProxy?.let(ThrowableProxyUtil::asString),
        trace =
            if (traceId != null && projectId.isNotEmpty()) "projects/$projectId/traces/$traceId"
            else null,
        labels = labels.ifEmpty { null },
    )
  }

  private fun severity(level: Level): String =
      when (level) {
        Level.ERROR -> "ERROR"
        Level.WARN -> "WARNING"
        Level.INFO -> "INFO"
        else -> "DEBUG"
      }
}
