package com.doable.realtime;

import com.doable.common.CurrentUser;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class EventsController {

    private final RealtimeService realtime;

    public EventsController(RealtimeService realtime) {
        this.realtime = realtime;
    }

    /**
     * The live event stream. Browsers' EventSource can't send headers, so the token may come as
     * ?access_token=... on this one endpoint (see SecurityConfig).
     */
    @GetMapping(value = "/api/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@AuthenticationPrincipal Jwt jwt) {
        return realtime.connect(CurrentUser.id(jwt));
    }
}
